// public/workers/ratio-calculations-worker.js

// Helper functions specific to the Ratio Model
const calculateZScore = (data, lookback) => {
  if (data.length < lookback) {
    return Array(data.length).fill(0) // Not enough data for initial z-score
  }

  const zScores = []
  for (let i = 0; i < data.length; i++) {
    const windowStart = Math.max(0, i - lookback + 1)
    const windowData = data.slice(windowStart, i + 1)

    if (windowData.length === lookback) {
      const mean = windowData.reduce((sum, val) => sum + val, 0) / windowData.length
      const variance =
        windowData.length > 1
          ? windowData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (windowData.length - 1) // Sample variance
          : 0 // Handle case where windowData.length is 1
      const stdDev = Math.sqrt(variance)
      zScores.push(stdDev > 0 ? (data[i] - mean) / stdDev : 0)
    } else {
      zScores.push(0) // Not enough data in window yet
    }
  }
  return zScores
}

const calculateHalfLife = (spreads) => {
  const n = spreads.length
  if (n < 20) return { halfLife: 0, isValid: false }

  const y = []
  const x = []

  for (let i = 1; i < n; i++) {
    y.push(spreads[i] - spreads[i - 1])
    x.push(spreads[i - 1])
  }

  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0
  for (let i = 0; i < y.length; i++) {
    sumX += x[i]
    sumY += y[i]
    sumXY += x[i] * y[i]
    sumX2 += x[i] * x[i]
  }

  const beta = (y.length * sumXY - sumX * sumY) / (y.length * sumX2 - sumX * sumX)
  const halfLife = -Math.log(2) / beta

  return {
    halfLife: beta < 0 ? halfLife : 0,
    isValid: halfLife > 0 && halfLife < 252,
  }
}

const calculateRollingHalfLife = (data, windowSize) => {
  const result = []
  if (data.length < windowSize + 1) {
    return Array(data.length).fill(null)
  }

  for (let i = 0; i < data.length; i++) {
    if (i < windowSize - 1) {
      result.push(null)
      continue
    }

    const windowData = data.slice(Math.max(0, i - windowSize + 1), i + 1)
    const mean = windowData.reduce((sum, val) => sum + val, 0) / windowData.length

    const y = []
    const x = []

    for (let j = 1; j < windowData.length; j++) {
      y.push(windowData[j] - windowData[j - 1])
      x.push(windowData[j - 1] - mean)
    }

    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0
    for (let j = 0; j < y.length; j++) {
      sumX += x[j]
      sumY += y[j]
      sumXY += x[j] * y[j]
      sumX2 += x[j] * x[j]
    }

    if (sumX2 === 0) {
      result.push(null)
      continue
    }

    const beta = (y.length * sumXY - sumX * sumY) / (y.length * sumX2 - sumX * sumX)
    const halfLife = beta < 0 ? -Math.log(2) / beta : null

    if (halfLife !== null && halfLife > 0) {
      result.push(halfLife)
    } else {
      result.push(null)
    }
  }
  return result
}

// Main message handler for the Ratio Model worker
self.onmessage = async (event) => {
  const { type, data } = event.data

  if (type === "runRatioAnalysis") {
    const { pricesA, pricesB } = data.data
    const { ratioLookbackWindow } = data.params

    let analysisData = null
    let error = ""

    try {
      const minLength = Math.min(pricesA.length, pricesB.length)
      const dates = pricesA.map((d) => d.date).slice(0, minLength)
      const stockAPrices = pricesA.map((d) => d.close).slice(0, minLength)
      const stockBPrices = pricesB.map((d) => d.close).slice(0, minLength)

      const ratios = stockAPrices.map((priceA, i) => priceA / stockBPrices[i])
      const zScores = calculateZScore(ratios, ratioLookbackWindow)
      const rollingHalfLifes = calculateRollingHalfLife(ratios, ratioLookbackWindow)

      // Calculate mean and std dev only on the "warmed up" data
      const dataForMeanStdDev = ratios.slice(ratioLookbackWindow - 1)
      let meanValue = 0
      let stdDevValue = 0
      if (dataForMeanStdDev.length > 0) {
        meanValue = dataForMeanStdDev.reduce((sum, val) => sum + val, 0) / dataForMeanStdDev.length
        const stdDevDenominator = dataForMeanStdDev.length > 1 ? dataForMeanStdDev.length - 1 : dataForMeanStdDev.length
        stdDevValue = Math.sqrt(
          dataForMeanStdDev.reduce((sum, val) => sum + Math.pow(val - meanValue, 2), 0) / stdDevDenominator,
        )
      }

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

      const rollingStatsWindow = ratioLookbackWindow

      for (let i = 0; i < ratios.length; i++) {
        const windowStart = Math.max(0, i - rollingStatsWindow + 1)
        const window = ratios.slice(windowStart, i + 1)
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
          meanRatio: meanValue,
          stdDevRatio: stdDevValue,
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
      console.error("Error in ratio calculations worker:", e)
      error = e.message || "An unknown error occurred during ratio analysis."
    } finally {
      self.postMessage({ type: "ratioAnalysisComplete", analysisData, error })
    }
  }
}
