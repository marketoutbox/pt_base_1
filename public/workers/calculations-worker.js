// Main Calculations Worker
// This worker handles OLS, Kalman, Euclidean models and common statistical tests

console.log("Main calculations worker started")

let wasmModule = null
let isWasmReady = false

// Load WASM module
async function loadWasm() {
  try {
    console.log("Loading WASM module...")
    // Ensure the path is correct relative to the worker script
    const wasmScript = await import("/wasm/adf_test_pkg/adf_test.js")
    await wasmScript.default() // Initialize the WASM module
    wasmModule = wasmScript
    isWasmReady = true
    console.log("WASM module loaded successfully")
  } catch (error) {
    console.error("Failed to load WASM module:", error)
    isWasmReady = false
    self.postMessage({
      type: "error",
      message: `WASM initialization failed: ${error.message || error}`,
    })
  }
}

// Initialize WASM on worker startup
loadWasm()

// Matrix operations for 2x2 matrices
function matrixMultiply2x2(A, B) {
  return [
    [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
    [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
  ]
}

function matrixInverse2x2(A) {
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
  if (Math.abs(det) < 1e-10) {
    return [
      [1, 0],
      [0, 1],
    ] // Return identity if singular
  }
  return [
    [A[1][1] / det, -A[0][1] / det],
    [-A[1][0] / det, A[0][0] / det],
  ]
}

// Rolling window calculations
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
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (slice.length - 1)
      result.push(Math.sqrt(variance))
    }
  }
  return result
}

// OLS regression
function calculateOLS(pricesA, pricesB, lookbackWindow) {
  const hedgeRatios = []
  const alphas = []
  const spreads = []

  for (let i = 0; i < pricesA.length; i++) {
    if (i < lookbackWindow - 1) {
      hedgeRatios.push(Number.NaN)
      alphas.push(Number.NaN)
      spreads.push(Number.NaN)
      continue
    }

    const windowA = pricesA.slice(i - lookbackWindow + 1, i + 1)
    const windowB = pricesB.slice(i - lookbackWindow + 1, i + 1)

    // Calculate regression coefficients
    const n = windowA.length
    const sumA = windowA.reduce((sum, val) => sum + val, 0)
    const sumB = windowB.reduce((sum, val) => sum + val, 0)
    const sumAB = windowA.reduce((sum, val, idx) => sum + val * windowB[idx], 0)
    const sumBB = windowB.reduce((sum, val) => sum + val * val, 0)

    const denominator = n * sumBB - sumB * sumB
    if (denominator === 0) {
      hedgeRatios.push(Number.NaN)
      alphas.push(Number.NaN)
      spreads.push(Number.NaN)
      continue
    }

    const beta = (n * sumAB - sumA * sumB) / denominator
    const alpha = (sumA - beta * sumB) / n

    hedgeRatios.push(beta)
    alphas.push(alpha)
    spreads.push(pricesA[i] - (alpha + beta * pricesB[i])) // Corrected spread calculation
  }

  return { hedgeRatios, alphas, spreads }
}

// Kalman Filter implementation
function calculateKalman(pricesA, pricesB, processNoise, initialLookback) {
  const hedgeRatios = []
  const alphas = []
  const spreads = []

  // Initialize with OLS for the first window
  let state = [0, 1] // [alpha, beta]
  let P = [
    [1, 0],
    [0, 1],
  ] // Covariance matrix
  const Q = [
    [processNoise, 0],
    [0, processNoise],
  ] // Process noise
  const R = 1 // Measurement noise (simplified, could be adaptive)

  for (let i = 0; i < pricesA.length; i++) {
    if (i < initialLookback - 1) {
      hedgeRatios.push(Number.NaN)
      alphas.push(Number.NaN)
      spreads.push(Number.NaN)
      continue
    }

    if (i === initialLookback - 1) {
      // Initialize with OLS for the first `initialLookback` points
      const windowA = pricesA.slice(0, initialLookback)
      const windowB = pricesB.slice(0, initialLookback)

      const n = windowA.length
      const sumA = windowA.reduce((sum, val) => sum + val, 0)
      const sumB = windowB.reduce((sum, val) => sum + val, 0)
      const sumAB = windowA.reduce((sum, val, idx) => sum + val * windowB[idx], 0)
      const sumBB = windowB.reduce((sum, val) => sum + val * val, 0)

      const denominator = n * sumBB - sumB * sumB
      if (denominator === 0) {
        state = [0, 1] // Default if OLS fails
      } else {
        const beta = (n * sumAB - sumA * sumB) / denominator
        const alpha = (sumA - beta * sumB) / n
        state = [alpha, beta]
      }
    } else {
      // Kalman filter update
      // Prediction step
      // F is identity for constant state model
      P = matrixMultiply2x2(P, [
        [1, 0],
        [0, 1],
      ]) // P_pred = F * P * F^T
      P[0][0] += Q[0][0]
      P[1][1] += Q[1][1]

      // Update step
      const H = [1, pricesB[i]] // Observation matrix [1, priceB]
      const predictedY = state[0] + state[1] * pricesB[i]
      const innovation = pricesA[i] - predictedY // y_t - H_t * x_pred

      const S = H[0] * P[0][0] * H[0] + H[1] * P[1][1] * H[1] + R // Innovation covariance
      if (Math.abs(S) < 1e-10) {
        // Avoid division by zero, skip update
        hedgeRatios.push(state[1])
        alphas.push(state[0])
        spreads.push(pricesA[i] - (state[0] + state[1] * pricesB[i]))
        continue
      }

      const K = [(P[0][0] * H[0]) / S, (P[1][1] * H[1]) / S] // Kalman gain

      // Update state
      state[0] += K[0] * innovation
      state[1] += K[1] * innovation

      // Update covariance
      const I_minus_KH = [
        [1 - K[0] * H[0], -K[0] * H[1]],
        [-K[1] * H[0], 1 - K[1] * H[1]],
      ]
      P = matrixMultiply2x2(I_minus_KH, P)
    }

    hedgeRatios.push(state[1])
    alphas.push(state[0])
    spreads.push(pricesA[i] - (state[0] + state[1] * pricesB[i]))
  }

  return { hedgeRatios, alphas, spreads }
}

// Euclidean Distance calculation
function calculateEuclideanDistance(pricesA, pricesB, lookbackWindow) {
  const distances = []
  const normalizedPricesA = []
  const normalizedPricesB = []

  for (let i = 0; i < pricesA.length; i++) {
    if (i < lookbackWindow - 1) {
      distances.push(Number.NaN)
      normalizedPricesA.push(Number.NaN)
      normalizedPricesB.push(Number.NaN)
      continue
    }

    const windowA = pricesA.slice(i - lookbackWindow + 1, i + 1)
    const windowB = pricesB.slice(i - lookbackWindow + 1, i + 1)

    // Calculate mean and std dev for the window
    const meanA = windowA.reduce((sum, val) => sum + val, 0) / windowA.length
    const meanB = windowB.reduce((sum, val) => sum + val, 0) / windowB.length
    const stdA = Math.sqrt(windowA.reduce((sum, val) => sum + Math.pow(val - meanA, 2), 0) / windowA.length)
    const stdB = Math.sqrt(windowB.reduce((sum, val) => sum + Math.pow(val - meanB, 2), 0) / windowB.length)

    // Normalize current prices
    const normA = stdA > 0 ? (pricesA[i] - meanA) / stdA : 0
    const normB = stdB > 0 ? (pricesB[i] - meanB) / stdB : 0

    normalizedPricesA.push(normA)
    normalizedPricesB.push(normB)
    distances.push(Math.sqrt(normA * normA + normB * normB))
  }

  return { distances, normalizedPricesA, normalizedPricesB }
}

// ADF Test - calculate t-statistic in JavaScript, use WASM for p-value lookup
function performADFTest(series) {
  try {
    const cleanSeries = series.filter((val) => !isNaN(val) && isFinite(val))
    if (cleanSeries.length < 10) {
      console.warn("Insufficient data for ADF test, returning fallback.")
      return {
        statistic: -2.5,
        pValue: 1,
        criticalValues: { "1%": -3.43, "5%": -2.86, "10%": -2.57 },
        isStationary: false,
      }
    }

    // Calculate ADF t-statistic in JavaScript
    const n = cleanSeries.length
    const y = cleanSeries.slice(1).map((val, i) => val - cleanSeries[i]) // First differences
    const x = cleanSeries.slice(0, -1) // Lagged values

    if (y.length !== x.length || y.length < 5) {
      return {
        statistic: -2.5,
        pValue: 1,
        criticalValues: { "1%": -3.43, "5%": -2.86, "10%": -2.57 },
        isStationary: false,
      }
    }

    // OLS regression: y = beta * x + error
    const n_reg = y.length
    const sumX = x.reduce((sum, val) => sum + val, 0)
    const sumY = y.reduce((sum, val) => sum + val, 0)
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0)
    const sumXX = x.reduce((sum, val) => sum + val * val, 0)

    const denominator = n_reg * sumXX - sumX * sumX
    if (denominator === 0) {
      return {
        statistic: -2.5,
        pValue: 1,
        criticalValues: { "1%": -3.43, "5%": -2.86, "10%": -2.57 },
        isStationary: false,
      }
    }

    const beta = (n_reg * sumXY - sumX * sumY) / denominator

    // Calculate residuals and standard error
    const residuals = y.map((val, i) => val - beta * x[i])
    const rss = residuals.reduce((sum, val) => sum + val * val, 0)
    const mse = rss / (n_reg - 1)
    const se_beta = Math.sqrt(mse / (sumXX - (sumX * sumX) / n_reg))

    // ADF t-statistic
    const adf_statistic = beta / se_beta

    // Use WASM for p-value lookup
    if (isWasmReady && wasmModule && wasmModule.get_adf_p_value_and_stationarity) {
      const result = wasmModule.get_adf_p_value_and_stationarity(adf_statistic, n)
      return {
        statistic: adf_statistic,
        pValue: result.p_value,
        criticalValues: result.critical_values,
        isStationary: result.is_stationary,
      }
    } else {
      // Fallback without WASM
      console.warn("WASM not ready, using fallback p-value estimation")
      return {
        statistic: adf_statistic,
        pValue: adf_statistic < -2.86 ? 0.05 : 0.1,
        criticalValues: { "1%": -3.43, "5%": -2.86, "10%": -2.57 },
        isStationary: adf_statistic < -2.86,
      }
    }
  } catch (error) {
    console.error("ADF test error:", error)
    return {
      statistic: -2.5,
      pValue: 1,
      criticalValues: { "1%": -3.43, "5%": -2.86, "10%": -2.57 },
      isStationary: false,
    }
  }
}

// Hurst Exponent calculation
function calculateHurstExponent(series) {
  try {
    const cleanSeries = series.filter((val) => !isNaN(val) && isFinite(val))
    if (cleanSeries.length < 20) return 0.5

    const n = cleanSeries.length
    const lags = []
    const rs = []

    for (let lag = 2; lag <= Math.min(Math.floor(n / 4), 100); lag++) {
      const chunks = Math.floor(n / lag)
      let rsSum = 0

      for (let i = 0; i < chunks; i++) {
        const chunk = cleanSeries.slice(i * lag, (i + 1) * lag)
        const mean = chunk.reduce((sum, val) => sum + val, 0) / chunk.length

        let cumulativeDeviation = 0
        let maxDeviation = Number.NEGATIVE_INFINITY
        let minDeviation = Number.POSITIVE_INFINITY

        for (let j = 0; j < chunk.length; j++) {
          cumulativeDeviation += chunk[j] - mean
          maxDeviation = Math.max(maxDeviation, cumulativeDeviation)
          minDeviation = Math.min(minDeviation, cumulativeDeviation)
        }

        const range = maxDeviation - minDeviation
        const stdDev = Math.sqrt(chunk.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / chunk.length)

        if (stdDev > 0) {
          rsSum += range / stdDev
        }
      }

      if (chunks > 0) {
        lags.push(Math.log(lag))
        rs.push(Math.log(rsSum / chunks))
      }
    }

    if (lags.length < 3) return 0.5

    // Linear regression to find Hurst exponent
    const n_points = lags.length
    const sumX = lags.reduce((sum, val) => sum + val, 0)
    const sumY = rs.reduce((sum, val) => sum + val, 0)
    const sumXY = lags.reduce((sum, val, i) => sum + val * rs[i], 0)
    const sumXX = lags.reduce((sum, val) => sum + val * val, 0)

    const denominator = n_points * sumXX - sumX * sumX
    if (denominator === 0) return 0.5

    const hurst = (n_points * sumXY - sumX * sumY) / denominator
    return Math.max(0, Math.min(1, hurst))
  } catch (error) {
    console.error("Error calculating Hurst exponent:", error)
    return 0.5
  }
}

// Half-life calculation
function calculateHalfLife(series) {
  try {
    const cleanSeries = series.filter((val) => !isNaN(val) && isFinite(val))
    if (cleanSeries.length < 10) return { halfLife: -1, isValid: false }

    const y = cleanSeries.slice(1)
    const x = cleanSeries.slice(0, -1)

    const n = y.length
    const sumX = x.reduce((sum, val) => sum + val, 0)
    const sumY = y.reduce((sum, val) => sum + val, 0)
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0)
    const sumXX = x.reduce((sum, val) => sum + val * val, 0)

    const denominator = n * sumXX - sumX * sumX
    if (denominator === 0) return { halfLife: -1, isValid: false }

    const beta = (n * sumXY - sumX * sumY) / denominator

    if (beta >= 1 || beta <= 0) return { halfLife: -1, isValid: false }

    const halfLife = -Math.log(2) / Math.log(beta)
    const isValid = halfLife > 0 && halfLife < 252

    return { halfLife, isValid }
  } catch (error) {
    console.error("Error calculating half-life:", error)
    return { halfLife: -1, isValid: false }
  }
}

// Practical trade half-life
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
        inTrade = true
        entryIndex = i
        entryZScore = zScore
      } else if (inTrade && Math.abs(zScore) <= exitThreshold) {
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

    return { tradeCycleLength: avgDuration, successRate, isValid: true }
  } catch (error) {
    console.error("Error calculating practical trade half-life:", error)
    return { tradeCycleLength: -1, successRate: 0, isValid: false }
  }
}

// Calculate correlation
function calculateCorrelation(pricesA, pricesB) {
  const n = Math.min(pricesA.length, pricesB.length)
  if (n === 0) return 0

  const meanA = pricesA.slice(0, n).reduce((sum, val) => sum + val, 0) / n
  const meanB = pricesB.slice(0, n).reduce((sum, val) => sum + val, 0) / n

  let numerator = 0
  let sumSqA = 0
  let sumSqB = 0

  for (let i = 0; i < n; i++) {
    const devA = pricesA[i] - meanA
    const devB = pricesB[i] - meanB
    numerator += devA * devB
    sumSqA += devA * devA
    sumSqB += devB * devB
  }

  const denominator = Math.sqrt(sumSqA * sumSqB)
  return denominator > 0 ? numerator / denominator : 0
}

// Z-score calculation (re-defined for clarity, though similar to ratio worker)
function calculateZScores(data, means, stdDevs) {
  return data.map((value, i) => {
    if (isNaN(means[i]) || isNaN(stdDevs[i]) || stdDevs[i] === 0) {
      return Number.NaN
    }
    return (value - means[i]) / stdDevs[i]
  })
}

// Message handler
self.addEventListener("message", async (e) => {
  console.log("Main worker received message:", e.data.type)

  try {
    if (e.data.type === "runAnalysis") {
      const { pricesA, pricesB } = e.data.data
      const params = e.data.params
      const selectedPair = e.data.selectedPair

      console.log("Processing analysis for model:", params.modelType)

      const stockAPrices = pricesA.map((d) => d.close)
      const stockBPrices = pricesB.map((d) => d.close)
      const dates = pricesA.map((d) => d.date)

      let modelSpecificData = []
      let hedgeRatios = []
      let alphas = []
      let normalizedPricesA = []
      let normalizedPricesB = []

      // Run model-specific calculations
      if (params.modelType === "ols") {
        const result = calculateOLS(stockAPrices, stockBPrices, params.olsLookbackWindow)
        modelSpecificData = result.spreads
        hedgeRatios = result.hedgeRatios
        alphas = result.alphas
      } else if (params.modelType === "kalman") {
        const result = calculateKalman(
          stockAPrices,
          stockBPrices,
          params.kalmanProcessNoise,
          params.kalmanInitialLookback,
        )
        modelSpecificData = result.spreads
        hedgeRatios = result.hedgeRatios
        alphas = result.alphas
      } else if (params.modelType === "euclidean") {
        const result = calculateEuclideanDistance(stockAPrices, stockBPrices, params.euclideanLookbackWindow)
        modelSpecificData = result.distances
        normalizedPricesA = result.normalizedPricesA
        normalizedPricesB = result.normalizedPricesB
      }

      // Calculate z-scores
      const zScoreLookback = params.modelType === "euclidean" ? params.euclideanLookbackWindow : params.zScoreLookback
      const rollingMean = calculateRollingMean(modelSpecificData, zScoreLookback)
      const rollingStdDev = calculateRollingStdDev(modelSpecificData, zScoreLookback)
      const zScores = calculateZScores(modelSpecificData, rollingMean, rollingStdDev)

      // Calculate statistics
      const correlation = calculateCorrelation(stockAPrices, stockBPrices)
      const validData = modelSpecificData.filter((d) => !isNaN(d))
      const validZScores = zScores.filter((z) => !isNaN(z))

      const meanValue = validData.length > 0 ? validData.reduce((sum, d) => sum + d, 0) / validData.length : 0
      const stdDevValue =
        validData.length > 0
          ? Math.sqrt(validData.reduce((sum, d) => sum + Math.pow(d - meanValue, 2), 0) / validData.length)
          : 0
      const minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      const maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      // Statistical tests
      const adfResults = await performADFTest(modelSpecificData) // Await WASM call
      const { halfLife, isValid: halfLifeValid } = calculateHalfLife(modelSpecificData)
      const hurstExponent = calculateHurstExponent(modelSpecificData)
      const practicalTradeHalfLife = calculatePracticalTradeHalfLife(
        zScores,
        params.entryThreshold,
        params.exitThreshold,
      )

      // Create chart data
      const chartData = {
        rollingMean,
        rollingUpperBand1: rollingMean.map((mean, i) => mean + rollingStdDev[i]),
        rollingLowerBand1: rollingMean.map((mean, i) => mean - rollingStdDev[i]),
        rollingUpperBand2: rollingMean.map((mean, i) => mean + 2 * rollingStdDev[i]),
        rollingLowerBand2: rollingMean.map((mean, i) => mean - 2 * rollingStdDev[i]),
      }

      // Create table data
      const tableData = dates.map((date, i) => ({
        date: new Date(date).toLocaleDateString(),
        priceA: stockAPrices[i],
        priceB: stockBPrices[i],
        alpha: alphas[i],
        hedgeRatio: hedgeRatios[i],
        spread: params.modelType === "ols" || params.modelType === "kalman" ? modelSpecificData[i] : undefined,
        distance: params.modelType === "euclidean" ? modelSpecificData[i] : undefined,
        normalizedA: normalizedPricesA[i],
        normalizedB: normalizedPricesB[i],
        zScore: zScores[i],
        halfLife: "N/A", // Rolling half-life is not in this table, but overall is in stats
      }))

      const analysisData = {
        dates,
        ratios: [], // Only ratio model calculates this
        spreads: params.modelType === "ols" || params.modelType === "kalman" ? modelSpecificData : [],
        distances: params.modelType === "euclidean" ? modelSpecificData : [],
        hedgeRatios,
        alphas,
        zScores,
        stockAPrices,
        stockBPrices,
        normalizedPricesA,
        normalizedPricesB,
        statistics: {
          correlation,
          meanSpread: params.modelType === "ols" || params.modelType === "kalman" ? meanValue : undefined,
          stdDevSpread: params.modelType === "ols" || params.modelType === "kalman" ? stdDevValue : undefined,
          meanDistance: params.modelType === "euclidean" ? meanValue : undefined,
          stdDevDistance: params.modelType === "euclidean" ? stdDevValue : undefined,
          minZScore,
          maxZScore,
          adfResults,
          halfLife,
          halfLifeValid,
          hurstExponent,
          practicalTradeHalfLife,
          modelType: params.modelType,
        },
        tableData,
        chartData,
      }

      console.log("Analysis completed, sending results")
      self.postMessage({
        type: "analysisComplete",
        analysisData,
      })
    } else if (e.data.type === "runCommonStats") {
      // Handle common statistics calculation for ratio model
      const { pricesA, pricesB } = e.data.data
      const params = e.data.params
      const seriesForADF = params.seriesForADF
      const zScores = params.zScores

      console.log("Processing common stats for ratio model")

      const stockAPrices = pricesA.map((d) => d.close)
      const stockBPrices = pricesB.map((d) => d.close)

      // Calculate correlation
      const correlation = calculateCorrelation(stockAPrices, stockBPrices)

      // Calculate z-score statistics
      const validZScores = zScores.filter((z) => !isNaN(z))
      const minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      const maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      // Statistical tests
      const adfResults = await performADFTest(seriesForADF) // Await WASM call
      const { halfLife, isValid: halfLifeValid } = calculateHalfLife(seriesForADF)
      const hurstExponent = calculateHurstExponent(seriesForADF)
      const practicalTradeHalfLife = calculatePracticalTradeHalfLife(
        zScores,
        params.entryThreshold,
        params.exitThreshold,
      )

      const analysisData = {
        statistics: {
          correlation,
          minZScore,
          maxZScore,
          adfResults,
          halfLife,
          halfLifeValid,
          hurstExponent,
          practicalTradeHalfLife,
        },
      }

      console.log("Common stats completed, sending results")
      self.postMessage({
        type: "analysisComplete",
        analysisData,
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
