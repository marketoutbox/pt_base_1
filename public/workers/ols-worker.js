// public/workers/ols-worker.js
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

      const spreads = []
      const hedgeRatios = []
      const alphas = []

      for (let i = 0; i < minLength; i++) {
        const { beta, alpha } = commonUtils.calculateHedgeRatio(data.pricesA, data.pricesB, i, params.olsLookbackWindow)
        const currentPriceA = stockAPrices[i]
        const currentPriceB = stockBPrices[i]
        const spread = currentPriceA - (alpha + beta * currentPriceB)
        hedgeRatios.push(beta)
        alphas.push(alpha)
        spreads.push(spread)
      }

      const zScores = commonUtils.calculateZScore(spreads, params.zScoreLookback)
      const rollingHalfLifes = commonUtils.calculateRollingHalfLife(spreads, params.olsLookbackWindow)

      const dataForMeanStdDev = spreads.slice(params.olsLookbackWindow - 1)
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
      const adfResults = await commonUtils.adfTestWasm(spreads, "spreads")
      const halfLifeResult = commonUtils.calculateHalfLife(spreads)
      const hurstExponent = commonUtils.calculateHurstExponent(spreads)
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
          alpha: alphas[i],
          hedgeRatio: hedgeRatios[i],
          spread: spreads[i],
          zScore: zScores[i],
          halfLife: rollingHalfLifes[i] !== null ? rollingHalfLifes[i].toFixed(2) : "N/A",
        })
      }

      const rollingMean = []
      const rollingUpperBand1 = []
      const rollingLowerBand1 = []
      const rollingUpperBand2 = []
      const rollingLowerBand2 = []

      const dataForBands = spreads
      const rollingStatsWindow = params.olsLookbackWindow

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
        spreads,
        hedgeRatios,
        alphas,
        zScores,
        stockAPrices,
        stockBPrices,
        statistics: {
          correlation,
          meanSpread: meanValue,
          stdDevSpread: stdDevValue,
          minZScore,
          maxZScore,
          adfResults,
          halfLife: halfLifeResult.halfLife,
          halfLifeValid: halfLifeResult.isValid,
          hurstExponent,
          practicalTradeHalfLife,
          modelType: "ols",
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
      console.error("Error in OLS worker:", e)
      error = e.message || "An unknown error occurred during OLS analysis."
    } finally {
      self.postMessage({ type: "analysisComplete", analysisData, error })
    }
  }
}
