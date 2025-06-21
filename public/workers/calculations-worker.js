// public/workers/calculations-worker.js

// Import Pyodide core and load it
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js")

let pyodideReadyPromise

async function loadPyodideAndPackages() {
  if (!pyodideReadyPromise) {
    pyodideReadyPromise = (async () => {
      console.log("Loading Pyodide...")
      self.pyodide = await window.loadPyodide() // Declare the loadPyodide variable
      console.log("Pyodide loaded. Loading statsmodels...")
      await self.pyodide.loadPackage("statsmodels")
      console.log("statsmodels loaded.")
      return self.pyodide
    })()
  }
  return pyodideReadyPromise
}

// Call this immediately to start loading Pyodide in the background
loadPyodideAndPackages()

// Note: Web Workers have a different import mechanism. We'll assume utils/calculations.js is also available in the public directory or bundled.
// For simplicity in this worker, we'll re-implement or assume basic utility functions are available.
// In a real Next.js app, you might need a build step to make shared utilities available to workers.
// For now, I'll include a basic calculateZScore here.
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
      const variance = windowData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (windowData.length - 1) // Sample variance
      const stdDev = Math.sqrt(variance)
      zScores.push(stdDev > 0 ? (data[i] - mean) / stdDev : 0)
    } else {
      zScores.push(0) // Not enough data in window yet
    }
  }
  return zScores
}

// Matrix operations for 2x2 matrices (re-included for worker self-containment)
const matrixMultiply2x2 = (A, B) => {
  return [
    [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
    [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
  ]
}

const matrixSubtract2x2 = (A, B) => {
  return [
    [A[0][0] - B[0][0], A[0][1] - B[0][1]],
    [A[1][0] - B[1][0], A[1][1] - B[1][1]],
  ]
}

const scalarInverse = (x) => {
  return Math.abs(x) < 1e-10 ? 1.0 : 1.0 / x
}

// OLS regression for hedge ratio calculation
const calculateHedgeRatio = (pricesA, pricesB, currentIndex, windowSize) => {
  const startIdx = Math.max(0, currentIndex - windowSize + 1)
  const endIdx = currentIndex + 1

  let sumA = 0,
    sumB = 0,
    sumAB = 0,
    sumB2 = 0
  let count = 0

  for (let i = startIdx; i < endIdx; i++) {
    const priceA = typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
    const priceB = typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close

    if (isNaN(priceA) || isNaN(priceB)) {
      continue
    }

    sumA += priceA
    sumB += priceB
    sumAB += priceA * priceB
    sumB2 += priceB * priceB
    count++
  }

  if (count === 0 || count * sumB2 - sumB * sumB === 0) {
    return { beta: 1, alpha: 0 }
  }

  const numerator = count * sumAB - sumA * sumB
  const denominator = count * sumB2 - sumB * sumB
  const beta = numerator / denominator
  const alpha = sumA / count - beta * (sumB / count)

  return { beta, alpha }
}

// Kalman filter implementation
const kalmanFilter = (pricesA, pricesB, processNoise, measurementNoise, initialLookback) => {
  const n = pricesA.length

  if (n < initialLookback) {
    return { hedgeRatios: Array(n).fill(1), alphas: Array(n).fill(0) }
  }

  let sumA = 0,
    sumB = 0,
    sumAB = 0,
    sumB2 = 0
  for (let i = 0; i < initialLookback; i++) {
    const priceA = typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
    const priceB = typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close
    sumA += priceA
    sumB += priceB
    sumAB += priceA * priceB
    sumB2 += priceB * priceB
  }

  const meanA = sumA / initialLookback
  const meanB = sumB / initialLookback
  const numerator = initialLookback * sumAB - sumA * sumB
  const denominator = initialLookback * sumB2 - sumB * sumB
  const initialBeta = Math.abs(denominator) > 1e-10 ? numerator / denominator : 1.0
  const initialAlpha = meanA - initialBeta * meanB

  let residualSumSquares = 0
  for (let i = 0; i < initialLookback; i++) {
    const priceA = typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
    const priceB = typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close
    const predicted = initialAlpha + initialBeta * priceB
    const residual = priceA - predicted
    residualSumSquares += residual * residual
  }
  const adaptiveR = residualSumSquares / (initialLookback - 2)

  let x = [initialAlpha, initialBeta]
  let P = [
    [1000, 0],
    [0, 1000],
  ]
  const Q = [
    [processNoise, 0],
    [0, processNoise],
  ]

  const hedgeRatios = []
  const alphas = []

  for (let i = 0; i < initialLookback; i++) {
    hedgeRatios.push(initialBeta)
    alphas.push(initialAlpha)
  }

  for (let i = initialLookback; i < n; i++) {
    const priceA = typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
    const priceB = typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close

    const x_pred = [...x]
    const P_pred = matrixAdd2x2(P, Q)

    const H_t = [1, priceB]
    const predicted_y = H_t[0] * x_pred[0] + H_t[1] * x_pred[1]
    const innovation = priceA - predicted_y

    const H_P_pred = [P_pred[0][0] * H_t[0] + P_pred[0][1] * H_t[1], P_pred[1][0] * H_t[0] + P_pred[1][1] * H_t[1]]
    const innovation_covariance = H_P_pred[0] * H_t[0] + H_P_pred[1] * H_t[1] + adaptiveR

    const P_pred_H_T = [P_pred[0][0] * H_t[0] + P_pred[0][1] * H_t[1], P_pred[1][0] * H_t[0] + P_pred[1][1] * H_t[1]]
    const K = [
      P_pred_H_T[0] * scalarInverse(innovation_covariance),
      P_pred_H_T[1] * scalarInverse(innovation_covariance),
    ]

    x = [x_pred[0] + K[0] * innovation, x_pred[1] + K[1] * innovation]

    const K_H = [
      [K[0] * H_t[0], K[0] * H_t[1]],
      [K[1] * H_t[0], K[1] * H_t[1]],
    ]
    const I_minus_KH = matrixSubtract2x2(
      [
        [1, 0],
        [0, 1],
      ],
      K_H,
    )
    P = matrixMultiply2x2(I_minus_KH, P_pred)

    alphas.push(x[0])
    hedgeRatios.push(x[1])
  }

  return { hedgeRatios, alphas }
}

const calculateCorrelation = (pricesA, pricesB) => {
  const n = pricesA.length
  let sumA = 0,
    sumB = 0,
    sumAB = 0,
    sumA2 = 0,
    sumB2 = 0

  for (let i = 0; i < n; i++) {
    sumA += pricesA[i].close
    sumB += pricesB[i].close
    sumAB += pricesA[i].close * pricesB[i].close // Corrected: A * B
    sumA2 += pricesA[i].close * pricesA[i].close
    sumB2 += pricesB[i].close * pricesB[i].close
  }

  const numerator = n * sumAB - sumA * sumB
  const denominator = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB))

  return denominator === 0 ? 0 : numerator / denominator
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

const calculatePracticalTradeHalfLife = (zScores, entryThreshold = 2.0, exitThreshold = 0.5) => {
  const tradeCycles = []
  let inTrade = false
  let entryDay = 0
  let entryDirection = ""

  for (let i = 0; i < zScores.length; i++) {
    const currentZScore = zScores[i]

    if (!inTrade && Math.abs(currentZScore) >= entryThreshold) {
      inTrade = true
      entryDay = i
      entryDirection = currentZScore > 0 ? "positive" : "negative"
    }

    if (inTrade) {
      if (
        (entryDirection === "positive" && currentZScore <= exitThreshold) ||
        (entryDirection === "negative" && currentZScore >= -exitThreshold)
      ) {
        const cycleLength = i - entryDay + 1
        tradeCycles.push(cycleLength)
        inTrade = false
      }
    }
  }

  if (tradeCycles.length === 0) {
    return {
      tradeCycleLength: 0,
      isValid: false,
      sampleSize: 0,
      successRate: 0,
      medianCycleLength: 0,
    }
  }

  const avgCycleLength = tradeCycles.reduce((sum, val) => sum + val, 0) / tradeCycles.length
  const totalPotentialTrades = tradeCycles.length + (inTrade ? 1 : 0)
  const successRate = totalPotentialTrades > 0 ? tradeCycles.length / totalPotentialTrades : 0

  const sortedCycles = [...tradeCycles].sort((a, b) => a - b)
  const medianCycleLength = sortedCycles[Math.floor(sortedCycles.length / 2)]

  return {
    tradeCycleLength: avgCycleLength,
    medianCycleLength,
    successRate,
    sampleSize: tradeCycles.length,
    isValid: tradeCycles.length >= 5 && successRate > 0.7,
  }
}

const calculateHurstExponent = (data) => {
  const n = data.length
  if (n < 100) return 0.5

  const maxLag = Math.min(100, Math.floor(n / 2))
  const lags = []
  const rs = []

  for (let lag = 10; lag <= maxLag; lag += 10) {
    const rsValues = []

    for (let i = 0; i < n - lag; i += lag) {
      const series = data.slice(i, i + lag)
      const mean = series.reduce((sum, val) => sum + val, 0) / lag

      const cumDevs = []
      let sum = 0
      for (let j = 0; j < series.length; j++) {
        sum += series[j] - mean
        cumDevs.push(sum)
      }

      const range = Math.max(...cumDevs) - Math.min(...cumDevs)
      const stdDev = Math.sqrt(series.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / lag)

      if (stdDev > 0) {
        rsValues.push(range / stdDev)
      }
    }

    if (rsValues.length > 0) {
      lags.push(Math.log(lag))
      rs.push(Math.log(rsValues.reduce((sum, val) => sum + val, 0) / rsValues.length))
    }
  }

  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0
  for (let i = 0; i < lags.length; i++) {
    sumX += lags[i]
    sumY += rs[i]
    sumXY += lags[i] * rs[i]
    sumX2 += lags[i] * lags[i]
  }

  const hurstExponent = (lags.length * sumXY - sumX * sumY) / (lags.length * sumX2 - sumX * sumX)
  return hurstExponent
}

// ADF Test function (now using Pyodide)
const adfTestPyodide = async (data, seriesType) => {
  // Filter out NaN and Infinity values
  const cleanData = data.filter((val) => typeof val === "number" && isFinite(val))

  self.postMessage({
    type: "debug",
    message: `ADF Test: Received ${data.length} raw data points for ${seriesType}. Cleaned to ${cleanData.length} points.`,
  })
  if (cleanData.length > 0) {
    self.postMessage({
      type: "debug",
      message: `ADF Test: Sample of clean data (first 5): ${cleanData.slice(0, 5).join(", ")}`,
    })
    self.postMessage({
      type: "debug",
      message: `ADF Test: Sample of clean data (last 5): ${cleanData.slice(-5).join(", ")}`,
    })
  }

  if (cleanData.length < 5) {
    self.postMessage({
      type: "debug",
      message: `ADF Test: Not enough clean data points (${cleanData.length}) for ADF test. Returning default.`,
    })
    return { statistic: 0, pValue: 1, criticalValues: { "1%": 0, "5%": 0, "10%": 0 }, isStationary: false }
  }

  try {
    const pyodide = await loadPyodideAndPackages() // Ensure Pyodide is loaded

    // Convert JS array to Python list
    const pythonData = pyodide.toPy(cleanData)

    // Run ADF test in Python
    const pythonCode = `
import numpy as np
from statsmodels.tsa.stattools import adfuller

def run_adf(series):
  # statsmodels adfuller internally handles NaNs by dropping them, but we pre-clean for safety
  # and to ensure the length check is accurate for the *usable* data.
  if len(series) < 5: # adfuller requires at least 5 observations
      return {"statistic": 0, "pvalue": 1, "critical_values": {"1%": 0, "5%": 0, "10%": 0}, "is_stationary": False}
  
  result = adfuller(series, autolag='AIC')
  
  statistic = result[0]
  pvalue = result[1]
  critical_values = result[4]
  
  # Check if test statistic is less than critical value AND p-value is significant
  is_stationary = pvalue <= 0.05 and statistic < critical_values['5%']
  
  return {
      "statistic": statistic,
      "pvalue": pvalue,
      "critical_values": critical_values,
      "is_stationary": is_stationary
  }

run_adf(series)
`
    pyodide.globals.set("series", pythonData)
    const result = await pyodide.runPythonAsync(pythonCode)

    // Convert Python result back to JS object
    const jsResult = result.toJs({ dict_converter: Object.fromEntries })
    result.destroy() // Clean up Python object
    self.postMessage({ type: "debug", message: `ADF Test: Pyodide result: ${JSON.stringify(jsResult)}` })

    return {
      statistic: jsResult.statistic,
      pValue: jsResult.pvalue,
      criticalValues: jsResult.critical_values,
      isStationary: jsResult.is_stationary,
    }
  } catch (error) {
    console.error("Error running ADF test with Pyodide:", error)
    self.postMessage({ type: "error", message: `ADF Test Pyodide error: ${error.message}` })
    return { statistic: 0, pValue: 1, criticalValues: { "1%": 0, "5%": 0, "10%": 0 }, isStationary: false }
  }
}

// Main message handler for the worker
self.onmessage = async (event) => {
  // Corrected destructuring: pricesA and pricesB are inside event.data.data
  const {
    type,
    data: { pricesA, pricesB },
    params,
    selectedPair,
  } = event.data

  if (type === "runAnalysis") {
    const {
      modelType,
      ratioLookbackWindow,
      olsLookbackWindow,
      kalmanProcessNoise,
      kalmanMeasurementNoise,
      kalmanInitialLookback,
      euclideanLookbackWindow,
      zScoreLookback,
      entryThreshold,
      exitThreshold,
    } = params

    let analysisData = null
    let error = ""

    try {
      const minLength = Math.min(pricesA.length, pricesB.length)
      const dates = pricesA.map((d) => d.date).slice(0, minLength)
      const stockAPrices = pricesA.map((d) => d.close).slice(0, minLength)
      const stockBPrices = pricesB.map((d) => d.close).slice(0, minLength)

      let spreads = []
      let ratios = []
      let distances = []
      let hedgeRatios = []
      let alphas = []
      let zScores = []
      let rollingHalfLifes = []
      let meanValue = 0
      let stdDevValue = 0

      if (modelType === "ratio") {
        ratios = stockAPrices.map((priceA, i) => priceA / stockBPrices[i])
        zScores = calculateZScore(ratios, ratioLookbackWindow)
        rollingHalfLifes = calculateRollingHalfLife(ratios, ratioLookbackWindow)
        meanValue = ratios.reduce((sum, val) => sum + val, 0) / ratios.length
        stdDevValue = Math.sqrt(ratios.reduce((sum, val) => sum + Math.pow(val - meanValue, 2), 0) / ratios.length)
      } else if (modelType === "ols") {
        for (let i = 0; i < minLength; i++) {
          const { beta, alpha } = calculateHedgeRatio(pricesA, pricesB, i, olsLookbackWindow)
          const currentPriceA =
            typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
          const currentPriceB =
            typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close
          const spread = currentPriceA - (alpha + beta * currentPriceB)
          hedgeRatios.push(beta)
          alphas.push(alpha)
          spreads.push(spread)
        }
        zScores = calculateZScore(spreads, zScoreLookback)
        rollingHalfLifes = calculateRollingHalfLife(spreads, olsLookbackWindow) // Use OLS lookback for rolling half-life
        meanValue = spreads.reduce((sum, val) => sum + val, 0) / spreads.length
        stdDevValue = Math.sqrt(spreads.reduce((sum, val) => sum + Math.pow(val - meanValue, 2), 0) / spreads.length)
      } else if (modelType === "kalman") {
        const kalmanResults = kalmanFilter(
          pricesA,
          pricesB,
          kalmanProcessNoise,
          kalmanMeasurementNoise,
          kalmanInitialLookback,
        )
        hedgeRatios = kalmanResults.hedgeRatios
        alphas = kalmanResults.alphas
        spreads = stockAPrices.map((priceA, i) => priceA - (alphas[i] + hedgeRatios[i] * stockBPrices[i]))
        zScores = calculateZScore(spreads, zScoreLookback)
        rollingHalfLifes = calculateRollingHalfLife(spreads, kalmanInitialLookback) // Use Kalman initial lookback for rolling half-life
        meanValue = spreads.reduce((sum, val) => sum + val, 0) / spreads.length
        stdDevValue = Math.sqrt(spreads.reduce((sum, val) => sum + Math.pow(val - meanValue, 2), 0) / spreads.length)
      } else if (modelType === "euclidean") {
        const initialPriceA = pricesA[0].close
        const initialPriceB = pricesB[0].close
        const normalizedPricesA = stockAPrices.map((p) => p / initialPriceA)
        const normalizedPricesB = stockBPrices.map((p) => p / initialPriceB)
        distances = normalizedPricesA.map((normA, i) => Math.abs(normA - normalizedPricesB[i]))
        zScores = calculateZScore(distances, euclideanLookbackWindow)
        rollingHalfLifes = calculateRollingHalfLife(distances, euclideanLookbackWindow)
        meanValue = distances.reduce((sum, val) => sum + val, 0) / distances.length
        stdDevValue = Math.sqrt(
          distances.reduce((sum, val) => sum + Math.pow(val - meanValue, 2), 0) / distances.length,
        )
      }

      const validZScores = zScores.filter((z) => !isNaN(z))
      const minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      const maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      const correlation = calculateCorrelation(pricesA.slice(0, minLength), pricesB.slice(0, minLength))
      // Use Pyodide for ADF test
      const seriesForADF = modelType === "ratio" ? ratios : modelType === "euclidean" ? distances : spreads
      const seriesTypeForADF = modelType === "ratio" ? "ratios" : modelType === "euclidean" ? "distances" : "spreads"
      const adfResults = await adfTestPyodide(seriesForADF, seriesTypeForADF)
      const halfLifeResult = calculateHalfLife(
        modelType === "ratio" ? ratios : modelType === "euclidean" ? distances : spreads,
      )
      const hurstExponent = calculateHurstExponent(
        modelType === "ratio" ? ratios : modelType === "euclidean" ? distances : spreads,
      )
      const practicalTradeHalfLife = calculatePracticalTradeHalfLife(zScores, entryThreshold, exitThreshold)

      const tableData = []
      for (let i = 0; i < dates.length; i++) {
        const row = {
          date: dates[i],
          priceA: stockAPrices[i],
          priceB: stockBPrices[i],
          zScore: zScores[i],
          halfLife: rollingHalfLifes[i] !== null ? rollingHalfLifes[i].toFixed(2) : "N/A",
        }
        if (modelType === "ratio") {
          row.ratio = ratios[i]
        } else if (modelType === "ols" || modelType === "kalman") {
          row.alpha = alphas[i]
          row.hedgeRatio = hedgeRatios[i]
          row.spread = spreads[i]
        } else if (modelType === "euclidean") {
          row.normalizedA = stockAPrices[i] / pricesA[0].close
          row.normalizedB = stockBPrices[i] / pricesB[0].close
          row.distance = distances[i]
        }
        tableData.push(row)
      }

      const rollingMean = []
      const rollingUpperBand1 = []
      const rollingLowerBand1 = []
      const rollingUpperBand2 = []
      const rollingLowerBand2 = []

      const dataForBands = modelType === "ratio" ? ratios : modelType === "euclidean" ? distances : spreads
      const rollingStatsWindow =
        modelType === "ratio"
          ? ratioLookbackWindow
          : modelType === "euclidean"
            ? euclideanLookbackWindow
            : olsLookbackWindow // Use appropriate lookback

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
        spreads,
        distances,
        hedgeRatios,
        alphas,
        zScores,
        stockAPrices,
        stockBPrices,
        statistics: {
          correlation,
          meanRatio: modelType === "ratio" ? meanValue : undefined,
          stdDevRatio: modelType === "ratio" ? stdDevValue : undefined,
          meanSpread: modelType === "ols" || modelType === "kalman" ? meanValue : undefined,
          stdDevSpread: modelType === "ols" || modelType === "kalman" ? stdDevValue : undefined,
          meanDistance: modelType === "euclidean" ? meanValue : undefined,
          stdDevDistance: modelType === "euclidean" ? stdDevValue : undefined,
          minZScore,
          maxZScore,
          adfResults,
          halfLife: halfLifeResult.halfLife,
          halfLifeValid: halfLifeResult.isValid,
          hurstExponent,
          practicalTradeHalfLife,
          modelType,
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
      console.error("Error in calculations worker:", e)
      error = e.message || "An unknown error occurred during analysis."
    } finally {
      self.postMessage({ type: "analysisComplete", analysisData, error })
    }
  }
}

// Helper for matrix addition (needed by Kalman)
const matrixAdd2x2 = (A, B) => {
  return [
    [A[0][0] + B[0][0], A[0][1] + B[0][1]],
    [A[1][0] + B[1][0], A[1][1] + B[1][1]],
  ]
}
