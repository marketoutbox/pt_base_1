// public/workers/euclidean-worker.js
import * as commonUtils from "./common-utils.js"

self.onmessage = async (event) => {
  const { type, data, params, selectedPair } = event.data

  if (type === "runAnalysis") {
    await commonUtils.initializeWasm()

    let analysisData = null
    let error = ""

    try {
      const minLength = Math.min(data.pricesA.length, data.pricesB.length)
      const dates = data.pricesA.map((d) => d.date).slice(0, minLength)
      const stockAPrices = data.pricesA.map((d) => d.close).slice(0, minLength)
      const stockBPrices = data.pricesB.map((d) => d.close).slice(0, minLength)

      const initialPriceA = stockAPrices[0]
      const initialPriceB = stockBPrices[0]

      let normalizedPricesA, normalizedPricesB, distances

      if (initialPriceA === 0 || initialPriceB === 0 || isNaN(initialPriceA) || isNaN(initialPriceB)) {
        normalizedPricesA = Array(minLength).fill(Number.NaN)
        normalizedPricesB = Array(minLength).fill(Number.NaN)
        distances = Array(minLength).fill(Number.NaN)
      } else {
        normalizedPricesA = stockAPrices.map((p) => (isNaN(p) ? Number.NaN : p / initialPriceA))
        normalizedPricesB = stockBPrices.map((p) => (isNaN(p) ? Number.NaN : p / initialPriceB))
        distances = normalizedPricesA.map((normA, i) => {
          const normB = normalizedPricesB[i]
          return isNaN(normA) || isNaN(normB) ? Number.NaN : Math.abs(normA - normB)
        })
      }

      const zScores = commonUtils.calculateZScore(distances, params.euclideanLookbackWindow)
      const rollingHalfLifes = commonUtils.calculateRollingHalfLife(distances, params.euclideanLookbackWindow)

      const dataForMeanStdDev = distances
        .slice(params.euclideanLookbackWindow - 1)
        .filter((val) => typeof val === "number" && isFinite(val))
      let meanValue = 0
      let stdDevValue = 0
      if (dataForMeanStdDev.length > 0) {
        meanValue = dataForMeanStdDev.reduce((sum, val) => sum + val, 0) / dataForMeanStdDev.length
        const stdDevDenominator = dataForMeanStdDev.length > 1 ? dataForMeanStdDev.length - 1 : dataForMeanStdDev.length
        stdDevValue = Math.sqrt(
          dataForMeanStdDev.reduce((sum, val) => sum + Math.pow(val - meanValue, 2), 0) / stdDevDenominator,
        )
      }

      const validZScores = zScores.filter((z) => !isNaN(z))
      const minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      const maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      const correlation = commonUtils.calculateCorrelation(
        data.pricesA.slice(0, minLength),
        data.pricesB.slice(0, minLength),
      )
      const adfResults = await commonUtils.adfTestWasm(distances, "distances")
      const halfLifeResult = commonUtils.calculateHalfLife(distances)
      const hurstExponent = commonUtils.calculateHurstExponent(distances)
      const practicalTradeHalfLife = commonUtils.calculatePracticalTradeHalfLife(
        zScores,
        params.entryThreshold,
        params.exitThreshold,
      )

      const tableData = []
      for (let i = 0; i < dates.length; i++) {
        tableData.push({
          date: dates[i],
          priceA: stockAPrices[i],
          priceB: stockBPrices[i],
          normalizedA: normalizedPricesA[i],
          normalizedB: normalizedPricesB[i],
          distance: distances[i],
          zScore: zScores[i],
          halfLife: rollingHalfLifes[i] !== null ? rollingHalfLifes[i].toFixed(2) : "N/A",
        })
      }

      const rollingMean = []
      const rollingUpperBand1 = []
      const rollingLowerBand1 = []
      const rollingUpperBand2 = []
      const rollingLowerBand2 = []

      const dataForBands = distances
      const rollingStatsWindow = params.euclideanLookbackWindow

      for (let i = 0; i < dataForBands.length; i++) {
        const windowStart = Math.max(0, i - rollingStatsWindow + 1)
        const window = dataForBands.slice(windowStart, i + 1).filter((val) => typeof val === "number" && isFinite(val))

        if (window.length === 0) {
          rollingMean.push(Number.NaN)
          rollingUpperBand1.push(Number.NaN)
          rollingLowerBand1.push(Number.NaN)
          rollingUpperBand2.push(Number.NaN)
          rollingLowerBand2.push(Number.NaN)
          continue
        }

        const mean = window.reduce((sum, val) => sum + val, 0) / window.length
        const stdDev = Math.sqrt(window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / window.length)

        rollingMean.push(mean)
        rollingUpperBand1.push(mean + stdDev)
        rollingLowerBand1.push(mean - stdDev)
        rollingUpperBand2.push(mean + 2 * stdDev)
        rollingLowerBand2.push(mean - 2 * stdDev)
      }

      analysisData = {
        dates,
        distances,
        normalizedPricesA,
        normalizedPricesB,
        zScores,
        stockAPrices,
        stockBPrices,
        statistics: {
          correlation,
          meanDistance: meanValue,
          stdDevDistance: stdDevValue,
          minZScore,
          maxZScore,
          adfResults,
          halfLife: halfLifeResult.halfLife,
          halfLifeValid: halfLifeResult.isValid,
          hurstExponent,
          practicalTradeHalfLife,
          modelType: "euclidean",
        },
        tableData,
        chartData: {
          rollingMean,
          rollingUpperBand1,
          rollingLowerBand1,
          rollingUpperBand2,
          rollingLowerBand2,
        },
      }
    } catch (e) {
      console.error("Error in Euclidean worker:", e)
      error = e.message || "An unknown error occurred during Euclidean analysis."
    } finally {
      self.postMessage({ type: "analysisComplete", analysisData, error })
    }
  }
}
