// Main Calculations Worker
// This worker handles OLS, Kalman, Euclidean, and common statistical calculations

console.log("Main calculations worker started")

// Import WASM module for ADF test
let wasmModule = null
async function initWasm() {
  try {
    // Adjust path for worker context
    wasmModule = await import("/wasm/adf_test_pkg/adf_test.js")
    await wasmModule.default("/wasm/adf_test_pkg/adf_test_bg.wasm")
    console.log("ADF WASM module loaded successfully.")
  } catch (e) {
    console.error("Failed to load ADF WASM module:", e)
    self.postMessage({ type: "error", message: `Failed to load WASM module: ${e.message}` })
  }
}

// Initialize WASM as soon as the worker starts
initWasm()

// --- Common Utility Functions ---

// Simple rolling window calculations
function calculateRollingMean(data, window) {
  const result = []
  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) {
      result.push(Number.NaN)
    } else {
      const slice = data.slice(i - window + 1, i + 1)
      const mean = slice.reduce((sum, val) => sum + val, 0) / slice.length
      result.push(mean)
    }
  }
  return result
}

function calculateRollingStdDev(data, window) {
  const result = []
  const means = calculateRollingMean(data, window)

  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) {
      result.push(Number.NaN)
    } else {
      const slice = data.slice(i - window + 1, i + 1)
      const mean = means[i]
      // Use N-1 for sample standard deviation, ensure slice.length > 1
      const denominator = slice.length > 1 ? slice.length - 1 : slice.length // Fallback to N if length is 1
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / denominator
      result.push(Math.sqrt(variance))
    }
  }
  return result
}

function calculateZScores(data, means, stdDevs) {
  return data.map((value, i) => {
    if (isNaN(means[i]) || isNaN(stdDevs[i]) || stdDevs[i] === 0) {
      return Number.NaN
    }
    return (value - means[i]) / stdDevs[i]
  })
}

// Simple half-life calculation using AR(1) model
function calculateHalfLife(series) {
  try {
    // Remove NaN values
    const cleanSeries = series.filter((val) => !isNaN(val))
    if (cleanSeries.length < 10) return { halfLife: -1, isValid: false }

    // Calculate lagged series
    const y = cleanSeries.slice(1)
    const x = cleanSeries.slice(0, -1)

    if (y.length !== x.length || y.length < 5) return { halfLife: -1, isValid: false }

    // Simple linear regression: y = a + b*x
    const n = y.length
    const sumX = x.reduce((sum, val) => sum + val, 0)
    const sumY = y.reduce((sum, val) => sum + val, 0)
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0)
    const sumXX = x.reduce((sum, val) => sum + val * val, 0)

    const denominator = n * sumXX - sumX * sumX
    if (denominator === 0) return { halfLife: -1, isValid: false } // Avoid division by zero

    const beta = (n * sumXY - sumX * sumY) / denominator

    if (beta >= 1 || beta <= 0) return { halfLife: -1, isValid: false }

    const halfLife = -Math.log(2) / Math.log(beta)
    const isValid = halfLife > 0 && halfLife < 252 // Valid if between 0 and 252 days

    return { halfLife, isValid }
  } catch (error) {
    console.error("Error calculating half-life:", error)
    return { halfLife: -1, isValid: false }
  }
}

// Calculate practical trade half-life
function calculatePracticalTradeHalfLife(zScores, entryThreshold, exitThreshold) {
  try {
    const trades = []
    let inTrade = false
    let entryIndex = -1
    let entryZScore = 0

    for (let i = 0; i < zScores.length; i++) {
      const zScore = zScores[i]
      if (isNaN(zScore)) continue

      if (!inTrade && Math.abs(zScore) >= entryThreshold) {
        // Enter trade
        inTrade = true
        entryIndex = i
        entryZScore = zScore
      } else if (inTrade && Math.abs(zScore) <= exitThreshold) {
        // Exit trade
        const tradeDuration = i - entryIndex
        const successful = (entryZScore > 0 && zScore < entryZScore) || (entryZScore < 0 && zScore > entryZScore)
        trades.push({ duration: tradeDuration, successful })
        inTrade = false
      }
    }

    if (trades.length < 3) {
      return { tradeCycleLength: -1, successRate: 0, isValid: false }
    }

    const avgDuration = trades.reduce((sum, trade) => sum + trade.duration, 0) / trades.length
    const successRate = trades.filter((trade) => trade.successful).length / trades.length

    return {
      tradeCycleLength: avgDuration,
      successRate,
      isValid: true,
    }
  } catch (error) {
    console.error("Error calculating practical trade half-life:", error)
    return { tradeCycleLength: -1, successRate: 0, isValid: false }
  }
}

// Calculate Pearson Correlation Coefficient
function calculateCorrelation(x, y) {
  if (x.length !== y.length || x.length < 2) return 0

  const n = x.length
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0)
  const sumX2 = x.reduce((sum, val) => sum + val * val, 0)
  const sumY2 = y.reduce((sum, val) => sum + val * val, 0)

  const numerator = n * sumXY - sumX * sumY
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))

  if (denominator === 0) return 0 // Avoid division by zero
  return numerator / denominator
}

// Calculate Hurst Exponent (simplified Rescaled Range method)
function calculateHurstExponent(series) {
  if (series.length < 10) return 0.5 // Not enough data

  const n = series.length
  const lags = [2, 4, 8, 16, 32, 64, 128] // Example lags, can be more granular
  const logRs = []
  const logLags = []

  for (const lag of lags) {
    if (lag >= n) continue

    const numSegments = Math.floor(n / lag)
    const rsValues = []

    for (let i = 0; i < numSegments; i++) {
      const segment = series.slice(i * lag, (i + 1) * lag)
      if (segment.length < 2) continue

      const mean = segment.reduce((sum, val) => sum + val, 0) / segment.length
      const deviations = segment.map((val) => val - mean)
      const cumulativeDeviations = deviations.map(((sum) => (value) => ((sum += value), sum))(0))

      const range = Math.max(...cumulativeDeviations) - Math.min(...cumulativeDeviations)
      const stdDev = Math.sqrt(segment.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / segment.length)

      if (stdDev > 0) {
        rsValues.push(range / stdDev)
      }
    }

    if (rsValues.length > 0) {
      const meanRs = rsValues.reduce((sum, val) => sum + val, 0) / rsValues.length
      logRs.push(Math.log(meanRs))
      logLags.push(Math.log(lag))
    }
  }

  if (logLags.length < 2) return 0.5 // Not enough points for regression

  // Linear regression on log(R/S) vs log(n)
  const { beta } = linearRegression(logLags, logRs)
  return beta || 0.5 // Return 0.5 if regression fails
}

// Simple linear regression for Hurst (y = a + b*x)
function linearRegression(x, y) {
  const n = x.length
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0

  for (let i = 0; i < n; i++) {
    sumX += x[i]
    sumY += y[i]
    sumXY += x[i] * y[i]
    sumXX += x[i] * x[i]
  }

  const denominator = n * sumXX - sumX * sumX
  if (denominator === 0) {
    return { alpha: 0, beta: 0 } // Avoid division by zero
  }

  const beta = (n * sumXY - sumX * sumY) / denominator
  const alpha = (sumY - beta * sumX) / n

  return { alpha, beta }
}

// --- Model-Specific Calculations ---

// OLS Regression
function runOlsAnalysis(pricesA, pricesB, olsLookbackWindow, zScoreLookback) {
  const spreads = []
  const alphas = []
  const hedgeRatios = [] // Betas
  const dates = pricesA.map((d) => d.date)

  for (let i = 0; i < pricesA.length; i++) {
    if (i < olsLookbackWindow - 1) {
      spreads.push(Number.NaN)
      alphas.push(Number.NaN)
      hedgeRatios.push(Number.NaN)
    } else {
      const windowA = pricesA.slice(i - olsLookbackWindow + 1, i + 1).map((d) => d.close)
      const windowB = pricesB.slice(i - olsLookbackWindow + 1, i + 1).map((d) => d.close)

      // Simple linear regression: priceA = alpha + beta * priceB
      const n = windowA.length
      const sumX = windowB.reduce((sum, val) => sum + val, 0)
      const sumY = windowA.reduce((sum, val) => sum + val, 0)
      const sumXY = windowB.reduce((sum, val, idx) => sum + val * windowA[idx], 0)
      const sumXX = windowB.reduce((sum, val) => sum + val * val, 0)

      const denominator = n * sumXX - sumX * sumX
      let beta = Number.NaN
      let alpha = Number.NaN

      if (denominator !== 0) {
        beta = (n * sumXY - sumX * sumY) / denominator
        alpha = (sumY - beta * sumX) / n
      }

      alphas.push(alpha)
      hedgeRatios.push(beta)

      // Calculate spread using the latest alpha and beta
      const currentSpread = pricesA[i].close - (alpha + beta * pricesB[i].close)
      spreads.push(currentSpread)
    }
  }

  const validSpreads = spreads.filter((s) => !isNaN(s))
  const meanSpread = validSpreads.length > 0 ? validSpreads.reduce((sum, s) => sum + s, 0) / validSpreads.length : 0
  const stdDevSpread =
    validSpreads.length > 0
      ? Math.sqrt(validSpreads.reduce((sum, s) => sum + Math.pow(s - meanSpread, 2), 0) / validSpreads.length)
      : 0
  const minZScore = 0
  const maxZScore = 0

  // Calculate rolling mean and std dev for Z-scores
  const rollingMeanSpread = calculateRollingMean(spreads, zScoreLookback)
  const rollingStdDevSpread = calculateRollingStdDev(spreads, zScoreLookback)
  const zScores = calculateZScores(spreads, rollingMeanSpread, rollingStdDevSpread)

  const chartData = {
    rollingMean: rollingMeanSpread,
    rollingUpperBand1: rollingMeanSpread.map((mean, i) => mean + rollingStdDevSpread[i]),
    rollingLowerBand1: rollingMeanSpread.map((mean, i) => mean - rollingStdDevSpread[i]),
    rollingUpperBand2: rollingMeanSpread.map((mean, i) => mean + 2 * rollingStdDevSpread[i]),
    rollingLowerBand2: rollingMeanSpread.map((mean, i) => mean - 2 * rollingStdDevSpread[i]),
  }

  const tableData = dates.map((date, i) => ({
    date: new Date(date).toLocaleDateString(),
    priceA: pricesA[i].close,
    priceB: pricesB[i].close,
    alpha: alphas[i],
    hedgeRatio: hedgeRatios[i],
    spread: spreads[i],
    zScore: zScores[i],
    halfLife: "N/A", // Will be calculated by common stats
  }))

  return {
    dates,
    spreads,
    alphas,
    hedgeRatios,
    zScores,
    stockAPrices: pricesA.map((d) => d.close),
    stockBPrices: pricesB.map((d) => d.close),
    statistics: {
      meanSpread,
      stdDevSpread,
      minZScore, // Will be updated by common stats
      maxZScore, // Will be updated by common stats
      modelType: "ols",
      correlation: 0, // Will be updated by common stats
      adfResults: { statistic: 0, pValue: 1, criticalValues: { "1%": 0, "5%": 0, "10%": 0 }, isStationary: false }, // Will be updated by common stats
      hurstExponent: 0.5, // Will be updated by common stats
      halfLife: -1, // Will be updated by common stats
      halfLifeValid: false, // Will be updated by common stats
      practicalTradeHalfLife: { tradeCycleLength: 0, successRate: 0, isValid: false }, // Will be updated by common stats
    },
    tableData,
    chartData,
  }
}

// Kalman Filter
function runKalmanAnalysis(pricesA, pricesB, kalmanProcessNoise, kalmanInitialLookback, zScoreLookback) {
  const spreads = []
  const alphas = []
  const hedgeRatios = [] // Betas
  const dates = pricesA.map((d) => d.date)

  // Initial OLS for the first `kalmanInitialLookback` days
  const initialWindowA = pricesA.slice(0, kalmanInitialLookback).map((d) => d.close)
  const initialWindowB = pricesB.slice(0, kalmanInitialLookback).map((d) => d.close)

  let initialAlpha = 0
  let initialBeta = 0

  if (initialWindowA.length >= 2) {
    const n = initialWindowA.length
    const sumX = initialWindowB.reduce((sum, val) => sum + val, 0)
    const sumY = initialWindowA.reduce((sum, val) => sum + val, 0)
    const sumXY = initialWindowB.reduce((sum, val, idx) => sum + val * initialWindowA[idx], 0)
    const sumXX = initialWindowB.reduce((sum, val) => sum + val * val, 0)

    const denominator = n * sumXX - sumX * sumX
    if (denominator !== 0) {
      initialBeta = (n * sumXY - sumX * sumY) / denominator
      initialAlpha = (sumY - initialBeta * sumX) / n
    }
  }

  // Kalman Filter state variables
  const state = {
    alpha: initialAlpha,
    beta: initialBeta,
  }
  let covariance = [
    [1, 0],
    [0, 1],
  ] // Initial covariance matrix

  const Q = kalmanProcessNoise // Process noise (how much the parameters change over time)
  const R = 0.01 // Measurement noise (how noisy the spread observation is) - fixed for simplicity

  for (let i = 0; i < pricesA.length; i++) {
    const priceA = pricesA[i].close
    const priceB = pricesB[i].close

    if (i < kalmanInitialLookback) {
      // Use initial OLS values for the lookback period
      alphas.push(initialAlpha)
      hedgeRatios.push(initialBeta)
      spreads.push(priceA - (initialAlpha + initialBeta * priceB))
    } else {
      // Prediction step
      // State remains the same (random walk model for alpha and beta)
      // Covariance increases due to process noise
      covariance[0][0] += Q
      covariance[1][1] += Q

      // Measurement update step
      const H = [1, priceB] // Measurement matrix [1, PriceB] for spread = PriceA - (alpha + beta * PriceB)
      const predictedSpread = state.alpha + state.beta * priceB
      const innovation = priceA - predictedSpread // Actual spread - predicted spread

      // Calculate innovation covariance (S)
      const S = H[0] * covariance[0][0] * H[0] + H[1] * covariance[1][1] * H[1] + R
      // Add cross-terms for H * P * H_transpose
      // S = H[0]*P[0][0]*H[0] + H[0]*P[0][1]*H[1] + H[1]*P[1][0]*H[0] + H[1]*P[1][1]*H[1] + R
      // Simplified for diagonal P and H = [1, priceB]
      // S = 1*P[0][0]*1 + 1*P[0][1]*priceB + priceB*P[1][0]*1 + priceB*P[1][1]*priceB + R
      // Assuming P[0][1] and P[1][0] are small or zero for simplicity in this example
      // For a more robust 2D Kalman, full matrix multiplication for HPH' is needed.
      // Let's use a simplified S for now, or calculate it more accurately:
      const S_accurate =
        H[0] * (covariance[0][0] * H[0] + covariance[0][1] * H[1]) +
        H[1] * (covariance[1][0] * H[0] + covariance[1][1] * H[1]) +
        R

      if (S_accurate === 0) {
        // Avoid division by zero in Kalman Gain calculation
        alphas.push(state.alpha)
        hedgeRatios.push(state.beta)
        spreads.push(innovation) // Use innovation as spread if S_accurate is zero
        continue
      }

      // Kalman Gain (K)
      const K = [
        (covariance[0][0] * H[0] + covariance[0][1] * H[1]) / S_accurate,
        (covariance[1][0] * H[0] + covariance[1][1] * H[1]) / S_accurate,
      ]

      // Update state
      state.alpha = state.alpha + K[0] * innovation
      state.beta = state.beta + K[1] * innovation

      // Update covariance
      const I_KH = [
        [1 - K[0] * H[0], -K[0] * H[1]],
        [-K[1] * H[0], 1 - K[1] * H[1]],
      ]
      const newCovariance = [
        [
          I_KH[0][0] * covariance[0][0] + I_KH[0][1] * covariance[1][0],
          I_KH[0][0] * covariance[0][1] + I_KH[0][1] * covariance[1][1],
        ],
        [
          I_KH[1][0] * covariance[0][0] + I_KH[1][1] * covariance[1][0],
          I_KH[1][0] * covariance[0][1] + I_KH[1][1] * covariance[1][1],
        ],
      ]
      covariance = newCovariance

      alphas.push(state.alpha)
      hedgeRatios.push(state.beta)
      spreads.push(priceA - (state.alpha + state.beta * priceB))
    }
  }

  const validSpreads = spreads.filter((s) => !isNaN(s))
  const meanSpread = validSpreads.length > 0 ? validSpreads.reduce((sum, s) => sum + s, 0) / validSpreads.length : 0
  const stdDevSpread =
    validSpreads.length > 0
      ? Math.sqrt(validSpreads.reduce((sum, s) => sum + Math.pow(s - meanSpread, 2), 0) / validSpreads.length)
      : 0
  const minZScore = 0
  const maxZScore = 0

  // Calculate rolling mean and std dev for Z-scores
  const rollingMeanSpread = calculateRollingMean(spreads, zScoreLookback)
  const rollingStdDevSpread = calculateRollingStdDev(spreads, zScoreLookback)
  const zScores = calculateZScores(spreads, rollingMeanSpread, rollingStdDevSpread)

  const chartData = {
    rollingMean: rollingMeanSpread,
    rollingUpperBand1: rollingMeanSpread.map((mean, i) => mean + rollingStdDevSpread[i]),
    rollingLowerBand1: rollingMeanSpread.map((mean, i) => mean - rollingStdDevSpread[i]),
    rollingUpperBand2: rollingMeanSpread.map((mean, i) => mean + 2 * rollingStdDevSpread[i]),
    rollingLowerBand2: rollingMeanSpread.map((mean, i) => mean - 2 * rollingStdDevSpread[i]),
  }

  const tableData = dates.map((date, i) => ({
    date: new Date(date).toLocaleDateString(),
    priceA: pricesA[i].close,
    priceB: pricesB[i].close,
    alpha: alphas[i],
    hedgeRatio: hedgeRatios[i],
    spread: spreads[i],
    zScore: zScores[i],
    halfLife: "N/A", // Will be calculated by common stats
  }))

  return {
    dates,
    spreads,
    alphas,
    hedgeRatios,
    zScores,
    stockAPrices: pricesA.map((d) => d.close),
    stockBPrices: pricesB.map((d) => d.close),
    statistics: {
      meanSpread,
      stdDevSpread,
      minZScore, // Will be updated by common stats
      maxZScore, // Will be updated by common stats
      modelType: "kalman",
      correlation: 0, // Will be updated by common stats
      adfResults: { statistic: 0, pValue: 1, criticalValues: { "1%": 0, "5%": 0, "10%": 0 }, isStationary: false }, // Will be updated by common stats
      hurstExponent: 0.5, // Will be updated by common stats
      halfLife: -1, // Will be updated by common stats
      halfLifeValid: false, // Will be updated by common stats
      practicalTradeHalfLife: { tradeCycleLength: 0, successRate: 0, isValid: false }, // Will be updated by common stats
    },
    tableData,
    chartData,
  }
}

// Euclidean Distance
function runEuclideanAnalysis(pricesA, pricesB, euclideanLookbackWindow) {
  const dates = pricesA.map((d) => d.date)
  const stockAPrices = pricesA.map((d) => d.close)
  const stockBPrices = pricesB.map((d) => d.close)

  // Normalize prices (Min-Max Scaling)
  const minA = Math.min(...stockAPrices)
  const maxA = Math.max(...stockAPrices)
  const normalizedPricesA = stockAPrices.map((p) => (p - minA) / (maxA - minA))

  const minB = Math.min(...stockBPrices)
  const maxB = Math.max(...stockBPrices)
  const normalizedPricesB = stockBPrices.map((p) => (p - minB) / (maxB - minB))

  const distances = normalizedPricesA.map((normA, i) => Math.sqrt(Math.pow(normA - normalizedPricesB[i], 2)))

  // Calculate rolling mean and std dev for distances
  const rollingMeanDistance = calculateRollingMean(distances, euclideanLookbackWindow)
  const rollingStdDevDistance = calculateRollingStdDev(distances, euclideanLookbackWindow)
  const zScores = calculateZScores(distances, rollingMeanDistance, rollingStdDevDistance)

  const validDistances = distances.filter((d) => !isNaN(d))
  const meanDistance =
    validDistances.length > 0 ? validDistances.reduce((sum, d) => sum + d, 0) / validDistances.length : 0
  const stdDevDistance =
    validDistances.length > 0
      ? Math.sqrt(validDistances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / validDistances.length)
      : 0
  const minZScore = 0
  const maxZScore = 0

  const chartData = {
    rollingMean: rollingMeanDistance,
    rollingUpperBand1: rollingMeanDistance.map((mean, i) => mean + rollingStdDevDistance[i]),
    rollingLowerBand1: rollingMeanDistance.map((mean, i) => mean - rollingStdDevDistance[i]),
    rollingUpperBand2: rollingMeanDistance.map((mean, i) => mean + 2 * rollingStdDevDistance[i]),
    rollingLowerBand2: rollingMeanDistance.map((mean, i) => mean - 2 * rollingStdDevDistance[i]),
  }

  const tableData = dates.map((date, i) => ({
    date: new Date(date).toLocaleDateString(),
    priceA: stockAPrices[i],
    priceB: stockBPrices[i],
    normalizedA: normalizedPricesA[i],
    normalizedB: normalizedPricesB[i],
    distance: distances[i],
    zScore: zScores[i],
    halfLife: "N/A", // Will be calculated by common stats
  }))

  return {
    dates,
    distances,
    normalizedPricesA,
    normalizedPricesB,
    zScores,
    stockAPrices,
    stockBPrices,
    statistics: {
      meanDistance,
      stdDevDistance,
      minZScore, // Will be updated by common stats
      maxZScore, // Will be updated by common stats
      modelType: "euclidean",
      correlation: 0, // Will be updated by common stats
      adfResults: { statistic: 0, pValue: 1, criticalValues: { "1%": 0, "5%": 0, "10%": 0 }, isStationary: false }, // Will be updated by common stats
      hurstExponent: 0.5, // Will be updated by common stats
      halfLife: -1, // Will be updated by common stats
      halfLifeValid: false, // Will be updated by common stats
      practicalTradeHalfLife: { tradeCycleLength: 0, successRate: 0, isValid: false }, // Will be updated by common stats
    },
    tableData,
    chartData,
  }
}

// --- Message Handler ---
self.addEventListener("message", async (e) => {
  console.log("Main worker received message:", e.data.type)

  try {
    if (e.data.type === "runAnalysis") {
      const { pricesA, pricesB } = e.data.data
      const {
        modelType,
        olsLookbackWindow,
        kalmanProcessNoise,
        kalmanInitialLookback,
        euclideanLookbackWindow,
        zScoreLookback,
        entryThreshold,
        exitThreshold,
      } = e.data.params

      let analysisData = null
      let seriesForADF = [] // Series to pass to ADF test (spreads or distances)
      let zScoresForPracticalHalfLife = []

      if (modelType === "ols") {
        analysisData = runOlsAnalysis(pricesA, pricesB, olsLookbackWindow, zScoreLookback)
        seriesForADF = analysisData.spreads
        zScoresForPracticalHalfLife = analysisData.zScores
      } else if (modelType === "kalman") {
        analysisData = runKalmanAnalysis(pricesA, pricesB, kalmanProcessNoise, kalmanInitialLookback, zScoreLookback)
        seriesForADF = analysisData.spreads
        zScoresForPracticalHalfLife = analysisData.zScores
      } else if (modelType === "euclidean") {
        analysisData = runEuclideanAnalysis(pricesA, pricesB, euclideanLookbackWindow)
        seriesForADF = analysisData.distances
        zScoresForPracticalHalfLife = analysisData.zScores
      } else {
        throw new Error("Unknown model type for main analysis.")
      }

      // --- Common Statistical Calculations ---
      const stockAPrices = pricesA.map((d) => d.close)
      const stockBPrices = pricesB.map((d) => d.close)

      // Correlation
      const correlation = calculateCorrelation(stockAPrices, stockBPrices)

      // ADF Test (using WASM)
      let adfResults = { statistic: 0, pValue: 1, criticalValues: { "1%": 0, "5%": 0, "10%": 0 }, isStationary: false }
      if (wasmModule && wasmModule.adf_test && seriesForADF.filter((s) => !isNaN(s)).length > 0) {
        try {
          const cleanSeriesForADF = seriesForADF.filter((s) => !isNaN(s))
          const adfTestResult = wasmModule.adf_test(new Float64Array(cleanSeriesForADF))
          adfResults = {
            statistic: adfTestResult.statistic,
            pValue: adfTestResult.p_value,
            criticalValues: adfTestResult.critical_values,
            isStationary: adfTestResult.is_stationary,
          }
          console.log("ADF Test Result:", adfResults)
        } catch (adfError) {
          console.error("Error running ADF test in WASM:", adfError)
          self.postMessage({ type: "error", message: `ADF WASM error: ${adfError.message}` })
        }
      } else {
        console.warn("WASM module or adf_test function not available, or series is empty for ADF test.")
      }

      // Hurst Exponent
      const hurstExponent = calculateHurstExponent(seriesForADF)

      // Half-Life
      const { halfLife, isValid: halfLifeValid } = calculateHalfLife(seriesForADF)

      // Practical Trade Half-Life
      const practicalTradeHalfLife = calculatePracticalTradeHalfLife(
        zScoresForPracticalHalfLife,
        entryThreshold,
        exitThreshold,
      )

      // Update analysisData with common statistics
      analysisData.statistics.correlation = correlation
      analysisData.statistics.adfResults = adfResults
      analysisData.statistics.hurstExponent = hurstExponent
      analysisData.statistics.halfLife = halfLife
      analysisData.statistics.halfLifeValid = halfLifeValid
      analysisData.statistics.practicalTradeHalfLife = practicalTradeHalfLife

      // Update min/max Z-scores based on the final zScores array
      const validZScores = analysisData.zScores.filter((z) => !isNaN(z))
      analysisData.statistics.minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      analysisData.statistics.maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      console.log("Main analysis completed, sending results")
      self.postMessage({
        type: "analysisComplete",
        analysisData,
      })
    } else if (e.data.type === "runCommonStats") {
      // This branch is specifically for the Ratio model to get common stats
      const { pricesA, pricesB } = e.data.data
      const { modelType, seriesForADF, zScores, entryThreshold, exitThreshold } = e.data.params

      const stockAPrices = pricesA.map((d) => d.close)
      const stockBPrices = pricesB.map((d) => d.close)

      // Correlation
      const correlation = calculateCorrelation(stockAPrices, stockBPrices)

      // ADF Test (using WASM)
      let adfResults = { statistic: 0, pValue: 1, criticalValues: { "1%": 0, "5%": 0, "10%": 0 }, isStationary: false }
      if (wasmModule && wasmModule.adf_test && seriesForADF.filter((s) => !isNaN(s)).length > 0) {
        try {
          const cleanSeriesForADF = seriesForADF.filter((s) => !isNaN(s))
          const adfTestResult = wasmModule.adf_test(new Float64Array(cleanSeriesForADF))
          adfResults = {
            statistic: adfTestResult.statistic,
            pValue: adfTestResult.p_value,
            criticalValues: adfTestResult.critical_values,
            isStationary: adfTestResult.is_stationary,
          }
          console.log("ADF Test Result (common stats):", adfResults)
        } catch (adfError) {
          console.error("Error running ADF test in WASM (common stats):", adfError)
          self.postMessage({ type: "error", message: `ADF WASM error (common stats): ${adfError.message}` })
        }
      } else {
        console.warn("WASM module or adf_test function not available, or series is empty for ADF test (common stats).")
      }

      // Hurst Exponent
      const hurstExponent = calculateHurstExponent(seriesForADF)

      // Half-Life
      const { halfLife, isValid: halfLifeValid } = calculateHalfLife(seriesForADF)

      // Practical Trade Half-Life
      const practicalTradeHalfLife = calculatePracticalTradeHalfLife(zScores, entryThreshold, exitThreshold)

      // Min/Max Z-scores
      const validZScores = zScores.filter((z) => !isNaN(z))
      const minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      const maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      const commonAnalysisData = {
        statistics: {
          correlation,
          adfResults,
          hurstExponent,
          halfLife,
          halfLifeValid,
          practicalTradeHalfLife,
          minZScore,
          maxZScore,
          modelType, // Pass modelType back for consistency
        },
      }

      console.log("Common stats analysis completed, sending results")
      self.postMessage({
        type: "analysisComplete",
        analysisData: commonAnalysisData,
      })
    } else {
      console.warn("Unknown message type:", e.data.type)
    }
  } catch (error) {
    console.error("Error in main worker:", error)
    self.postMessage({
      type: "analysisComplete",
      error: error.message,
      analysisData: null, // Ensure analysisData is null on error
    })
  }
})

self.addEventListener("error", (error) => {
  console.error("Main worker error:", error)
  self.postMessage({
    type: "error",
    message: error.message,
  })
})
