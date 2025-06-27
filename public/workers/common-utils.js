// public/workers/common-utils.js

// Import the WASM module and its initialization function
import init, { get_adf_p_value_and_stationarity } from "../wasm/adf_test.js"

let wasmInitialized = false

// Initialize WASM module once
export async function initializeWasm() {
  if (!wasmInitialized) {
    self.postMessage({ type: "debug", message: "Initializing WASM..." })
    try {
      await init()
      wasmInitialized = true
      self.postMessage({ type: "debug", message: "WASM initialized." })
    } catch (e) {
      console.error("Failed to initialize WASM:", e)
      self.postMessage({
        type: "error",
        message: `WASM initialization error: ${e instanceof Error ? e.message : String(e)}`,
      })
      throw e
    }
  }
}

// Utility functions
export const calculateZScore = (data, lookback) => {
  if (data.length < lookback) {
    return Array(data.length).fill(0)
  }

  const zScores = []
  for (let i = 0; i < data.length; i++) {
    const windowStart = Math.max(0, i - lookback + 1)
    const windowData = data.slice(windowStart, i + 1)

    if (windowData.length === lookback) {
      const mean = windowData.reduce((sum, val) => sum + val, 0) / windowData.length
      const variance =
        windowData.length > 1
          ? windowData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (windowData.length - 1)
          : 0
      const stdDev = Math.sqrt(variance)
      zScores.push(stdDev > 0 ? (data[i] - mean) / stdDev : 0)
    } else {
      zScores.push(0)
    }
  }
  return zScores
}

export const matrixMultiply2x2 = (A, B) => {
  return [
    [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
    [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
  ]
}

export const matrixSubtract2x2 = (A, B) => {
  return [
    [A[0][0] - B[0][0], A[0][1] - B[0][1]],
    [A[1][0] - B[1][0], A[1][1] - B[1][1]],
  ]
}

export const scalarInverse = (x) => {
  return Math.abs(x) < 1e-10 ? 1.0 : 1.0 / x
}

export const matrixAdd2x2 = (A, B) => {
  return [
    [A[0][0] + B[0][0], A[0][1] + B[0][1]],
    [A[1][0] + B[1][0], A[1][1] + B[1][1]],
  ]
}

export const invertMatrix = (matrix) => {
  const n = matrix.length
  const identity = Array(n)
    .fill(0)
    .map((_, i) =>
      Array(n)
        .fill(0)
        .map((_, j) => (i === j ? 1 : 0)),
    )

  const augmentedMatrix = Array(n)
    .fill(0)
    .map((_, i) => [...matrix[i], ...identity[i]])

  for (let i = 0; i < n; i++) {
    let pivotRow = i
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(augmentedMatrix[j][i]) > Math.abs(augmentedMatrix[pivotRow][i])) {
        pivotRow = j
      }
    }
    ;[augmentedMatrix[i], augmentedMatrix[pivotRow]] = [augmentedMatrix[pivotRow], augmentedMatrix[i]]

    const pivot = augmentedMatrix[i][i]
    if (Math.abs(pivot) < 1e-9) {
      return null
    }

    for (let j = i; j < 2 * n; j++) {
      augmentedMatrix[i][j] /= pivot
    }

    for (let j = 0; j < n; j++) {
      if (i !== j) {
        const factor = augmentedMatrix[j][i]
        for (let k = i; k < 2 * n; k++) {
          augmentedMatrix[j][k] -= factor * augmentedMatrix[i][k]
        }
      }
    }
  }

  return augmentedMatrix.map((row) => row.slice(n))
}

export const runMultiLinearRegression = (y_values, x_matrix) => {
  const numObservations = y_values.length
  const numPredictors = x_matrix[0].length

  const XtX = Array(numPredictors)
    .fill(0)
    .map(() => Array(numPredictors).fill(0))
  for (let i = 0; i < numPredictors; i++) {
    for (let j = 0; j < numPredictors; j++) {
      for (let k = 0; k < numObservations; k++) {
        XtX[i][j] += x_matrix[k][i] * x_matrix[k][j]
      }
    }
  }

  const XtY = Array(numPredictors).fill(0)
  for (let i = 0; i < numPredictors; i++) {
    for (let k = 0; k < numObservations; k++) {
      XtY[i] += x_matrix[k][i] * y_values[k]
    }
  }

  const XtX_inv = invertMatrix(XtX)

  if (!XtX_inv) {
    return {
      coefficients: Array(numPredictors).fill(0),
      stdErrors: Array(numPredictors).fill(Number.POSITIVE_INFINITY),
      SSR: Number.POSITIVE_INFINITY,
      nobs: numObservations,
      nparams: numPredictors,
    }
  }

  const coefficients = Array(numPredictors).fill(0)
  for (let i = 0; i < numPredictors; i++) {
    for (let j = 0; j < numPredictors; j++) {
      coefficients[i] += XtX_inv[i][j] * XtY[j]
    }
  }

  const residuals = []
  for (let i = 0; i < numObservations; i++) {
    let predictedY = 0
    for (let j = 0; j < numPredictors; j++) {
      predictedY += coefficients[j] * x_matrix[i][j]
    }
    residuals.push(y_values[i] - predictedY)
  }

  const SSR = residuals.reduce((sum, r) => sum + r * r, 0)
  const MSE = SSR / (numObservations - numPredictors)

  const stdErrors = Array(numPredictors).fill(0)
  for (let i = 0; i < numPredictors; i++) {
    stdErrors[i] = Math.sqrt(MSE * Math.max(0, XtX_inv[i][i]))
  }

  return { coefficients, stdErrors, SSR, nobs: numObservations, nparams: numPredictors }
}

export const calculateAdfTestStatistic = (data) => {
  const n = data.length
  if (n < 5) return 0

  const diffData = data.slice(1).map((val, i) => val - data[i])

  const minLags = 0
  const maxLags = Math.min(20, Math.floor(n / 2) - 2)

  let minCriterionValue = Number.POSITIVE_INFINITY
  let optimalTestStatistic = null

  for (let currentLags = minLags; currentLags <= maxLags; currentLags++) {
    const Y = []
    const X_matrix = []

    const effectiveStartIndex = Math.max(1, currentLags)

    if (diffData.length <= effectiveStartIndex) {
      continue
    }

    for (let i = effectiveStartIndex; i < diffData.length; i++) {
      Y.push(diffData[i])
      const row = [1, data[i]]
      for (let j = 1; j <= currentLags; j++) {
        if (i - j < 0) {
          continue
        }
        row.push(diffData[i - j])
      }
      X_matrix.push(row)
    }

    const k_params = 1 + 1 + currentLags

    if (Y.length < k_params) {
      continue
    }

    const regressionResults = runMultiLinearRegression(Y, X_matrix)

    if (
      !regressionResults ||
      typeof regressionResults.SSR === "undefined" ||
      !regressionResults.coefficients ||
      !regressionResults.stdErrors
    ) {
      continue
    }

    const SSR = regressionResults.SSR
    const N = regressionResults.nobs
    const k = regressionResults.nparams

    const currentAIC = N * Math.log(SSR / N) + 2 * k

    if (currentAIC < minCriterionValue) {
      minCriterionValue = currentAIC
      if (regressionResults.stdErrors[1] !== 0 && isFinite(regressionResults.stdErrors[1])) {
        optimalTestStatistic = regressionResults.coefficients[1] / regressionResults.stdErrors[1]
      } else {
        optimalTestStatistic = 0
      }
    }
  }

  return optimalTestStatistic !== null ? optimalTestStatistic : 0
}

export const adfTestWasm = async (data, seriesType) => {
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
    await initializeWasm()

    const testStatistic = calculateAdfTestStatistic(cleanData)

    const result = get_adf_p_value_and_stationarity(testStatistic)

    self.postMessage({ type: "debug", message: `ADF Test: WASM result: ${JSON.stringify(result)}` })

    return {
      statistic: result.statistic,
      pValue: result.p_value,
      criticalValues: result.critical_values,
      isStationary: result.is_stationary,
    }
  } catch (error) {
    console.error("Error running ADF test with WASM:", error)
    self.postMessage({ type: "error", message: `ADF Test WASM error: ${error.message}` })
    return { statistic: 0, pValue: 1, criticalValues: { "1%": 0, "5%": 0, "10%": 0 }, isStationary: false }
  }
}

export const calculateCorrelation = (pricesA, pricesB) => {
  const n = pricesA.length
  let sumA = 0,
    sumB = 0,
    sumAB = 0,
    sumA2 = 0,
    sumB2 = 0

  for (let i = 0; i < n; i++) {
    sumA += pricesA[i].close
    sumB += pricesB[i].close
    sumAB += pricesA[i].close * pricesB[i].close
    sumA2 += pricesA[i].close * pricesA[i].close
    sumB2 += pricesB[i].close * pricesB[i].close
  }

  const numerator = n * sumAB - sumA * sumB
  const denominator = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB))

  return denominator === 0 ? 0 : numerator / denominator
}

export const calculateHalfLife = (spreads) => {
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

export const calculateRollingHalfLife = (data, windowSize) => {
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

export const calculatePracticalTradeHalfLife = (zScores, entryThreshold = 2.0, exitThreshold = 0.5) => {
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

export const calculateHurstExponent = (data) => {
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

export const calculateHedgeRatio = (pricesA, pricesB, currentIndex, windowSize) => {
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

export const kalmanFilter = (pricesA, pricesB, processNoise, initialLookback) => {
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
