// Main Calculations Worker
// This worker handles OLS, Kalman, Euclidean models and common statistical tests

console.log("Main calculations worker started")

let wasmModule = null
let isWasmReady = false

// Load WASM module
async function loadWasm() {
  try {
    console.log("Loading WASM module in main worker...")
    // Ensure the path is correct relative to the worker script
    const wasmScript = await import("/wasm/adf_test_pkg/adf_test.js")
    await wasmScript.default() // Initialize the WASM module
    wasmModule = wasmScript
    isWasmReady = true
    console.log("WASM module loaded successfully in main worker")
  } catch (error) {
    console.error("Failed to load WASM module in main worker:", error)
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
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (slice.length - 1) // Bessel's correction
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
    const mse = rss / (n_reg - 1) // Using n_reg - 1 for sample variance of residuals
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

// Z-Score calculation
function calculateZScores(data, mean, stdDev) {
  return data.map((val, i) => (val - mean[i]) / stdDev[i])
}

// Correlation calculation
function calculateCorrelation(pricesA, pricesB) {
  const n = pricesA.length
  const meanA = pricesA.reduce((sum, val) => sum + val, 0) / n
  const meanB = pricesB.reduce((sum, val) => sum + val, 0) / n
  const sumA = pricesA.reduce((sum, val) => sum + Math.pow(val - meanA, 2), 0)
  const sumB = pricesB.reduce((sum, val) => sum + Math.pow(val - meanB, 2), 0)
  const sumAB = pricesA.reduce((sum, val, i) => sum + (val - meanA) * (pricesB[i] - meanB), 0)

  const denominator = Math.sqrt(sumA * sumB)
  if (denominator === 0) {
    return 0
  }

  return sumAB / denominator
}

// Half-Life calculation
function calculateHalfLife(data) {
  const isValid = data.length > 0
  let halfLife = 0

  if (isValid) {
    const mean = calculateRollingMean(data, data.length)[data.length - 1]
    const deviations = data.map((val) => Math.abs(val - mean))
    const sortedDeviations = deviations.slice().sort((a, b) => a - b)
    const midDeviation = sortedDeviations[Math.floor(sortedDeviations.length / 2)]

    const decayIndex = deviations.findIndex((dev) => dev <= midDeviation)
    halfLife = decayIndex !== -1 ? decayIndex : data.length
  }

  return { halfLife, isValid }
}

// Hurst Exponent calculation
function calculateHurstExponent(data) {
  const n = data.length
  const maxWindowSize = Math.floor(n / 2)
  let hurstExponent = 0

  for (let windowSize = 2; windowSize <= maxWindowSize; windowSize *= 2) {
    const variances = []
    for (let i = 0; i <= n - windowSize; i++) {
      const window = data.slice(i, i + windowSize)
      const mean = window.reduce((sum, val) => sum + val, 0) / windowSize
      const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / windowSize
      variances.push(variance)
    }

    const logVariances = variances.map((variance) => Math.log(variance))
    const logWindowSizes = Array.from({ length: variances.length }, (_, i) => Math.log(windowSize * i + windowSize))

    const olsResult = calculateOLS(logWindowSizes, logVariances, logWindowSizes.length)
    hurstExponent += olsResult.hedgeRatios[olsResult.hedgeRatios.length - 1]
  }

  hurstExponent /= Math.log(maxWindowSize) / Math.log(2)
  return hurstExponent
}

// Practical Trade Half-Life calculation
function calculatePracticalTradeHalfLife(zScores, entryThreshold, exitThreshold) {
  const isValid = zScores.length > 0
  let halfLife = 0

  if (isValid) {
    const entryIndex = zScores.findIndex((z) => z >= entryThreshold)
    const exitIndex = zScores.findIndex((z) => z <= exitThreshold)

    if (entryIndex !== -1 && exitIndex !== -1) {
      halfLife = exitIndex - entryIndex
    }
  }

  return { halfLife, isValid }
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
          ? Math.sqrt(validData.reduce((sum, d) => sum + Math.pow(d - meanValue, 2), 0) / (validData.length - 1)) // Bessel's correction
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
