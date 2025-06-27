// public/workers/ratio-worker.js
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

      const ratios = stockAPrices.map((priceA, i) => priceA / stockBPrices[i])
      const zScores = commonUtils.calculateZScore(ratios, params.ratioLookbackWindow)
      const rollingHalfLifes = commonUtils.calculateRollingHalfLife(ratios, params.ratioLookbackWindow)

      const dataForMeanStdDev = ratios.slice(params.ratioLookbackWindow - 1)
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
      const adfResults = await commonUtils.adfTestWasm(ratios, "ratios")
      const halfLifeResult = commonUtils.calculateHalfLife(ratios)
      const hurstExponent = commonUtils.calculateHurstExponent(ratios)
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
          ratio: ratios[i],
          zScore: zScores[i],
          halfLife: rollingHalfLifes[i] !== null ? rollingHalfLifes[i].toFixed(2) : "N/A",
        })
      }

      const rollingMean = []
      const rollingUpperBand1 = []
      const rollingLowerBand1 = []
      const rollingUpperBand2 = []
      const rollingLowerBand2 = []

      const dataForBands = ratios
      const rollingStatsWindow = params.ratioLookbackWindow

      for (let i = 0; i < dataForBands.length; i++) {
        const windowStart = Math.max(0, i - rollingStatsWindow + 1)
        const window = dataForBands.slice(windowStart, i + 1)
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
        ratios,
        zScores,
        stockAPrices,
        stockBPrices,
        statistics: {
          correlation,
          meanRatio: meanValue,
          stdDevRatio: stdDevValue,
          minZScore,
          maxZScore,
          adfResults,
          halfLife: halfLifeResult.halfLife,
          halfLifeValid: halfLifeResult.isValid,
          hurstExponent,
          practicalTradeHalfLife,
          modelType: "ratio",
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
      console.error("Error in ratio worker:", e)
      error = e.message || "An unknown error occurred during ratio analysis."
    } finally {
      self.postMessage({ type: "analysisComplete", analysisData, error })
    }
  }
}
