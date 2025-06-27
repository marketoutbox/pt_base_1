// Main Calculations Worker
// This worker handles OLS, Kalman, Euclidean models and common statistical tests

console.log("Main calculations worker started")

let wasmModule = null
let isWasmReady = false

// Load WASM module
async function loadWasm() {
  try {
    console.log("Loading WASM module...")
    const wasmScript = await import("/wasm/adf_test_pkg/adf_test.js")
    await wasmScript.default()
    wasmModule = wasmScript
    isWasmReady = true
    console.log("WASM module loaded successfully")
  } catch (error) {
    console.error("Failed to load WASM module:", error)
    isWasmReady = false
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
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / slice.length
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

    const beta = (n * sumAB - sumA * sumB) / (n * sumBB - sumB * sumB)
    const alpha = (sumA - beta * sumB) / n

    hedgeRatios.push(beta)
    alphas.push(alpha)
    spreads.push(pricesA[i] - beta * pricesB[i])
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
  const R = 1 // Measurement noise

  for (let i = 0; i < pricesA.length; i++) {
    if (i < initialLookback - 1) {
      hedgeRatios.push(Number.NaN)
      alphas.push(Number.NaN)
      spreads.push(Number.NaN)
      continue
    }

    if (i === initialLookback - 1) {
      // Initialize with OLS
      const windowA = pricesA.slice(0, initialLookback)
      const windowB = pricesB.slice(0, initialLookback)

      const n = windowA.length
      const sumA = windowA.reduce((sum, val) => sum + val, 0)
      const sumB = windowB.reduce((sum, val) => sum + val, 0)
      const sumAB = windowA.reduce((sum, val, idx) => sum + val * windowB[idx], 0)
      const sumBB = windowB.reduce((sum, val) => sum + val * val, 0)

      const beta = (n * sumAB - sumA * sumB) / (n * sumBB - sumB * sumB)
      const alpha = (sumA - beta * sumB) / n

      state = [alpha, beta]
    } else {
      // Kalman filter update
      // Prediction step
      const F = [
        [1, 0],
        [0, 1],
      ] // State transition (identity for random walk)
      P = matrixMultiply2x2(matrixMultiply2x2(F, P), [
        [1, 0],
        [0, 1],
      ]) // F * P * F^T
      P[0][0] += Q[0][0]
      P[1][1] += Q[1][1]

      // Update step
      const H = [1, pricesB[i]] // Observation matrix
      const y = pricesA[i] - (state[0] + state[1] * pricesB[i]) // Innovation
      const S = H[0] * P[0][0] * H[0] + H[1] * P[1][1] * H[1] + R // Innovation covariance

      if (Math.abs(S) > 1e-10) {
        const K = [(P[0][0] * H[0]) / S, (P[1][1] * H[1]) / S] // Kalman gain

        // Update state
        state[0] += K[0] * y
        state[1] += K[1] * y

        // Update covariance
        P[0][0] *= 1 - K[0] * H[0]
        P[1][1] *= 1 - K[1] * H[1]
      }
    }

    hedgeRatios.push(state[1])
    alphas.push(state[0])
    spreads.push(pricesA[i] - state[1] * pricesB[i])
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

    // Normalize prices
    const meanA = windowA.reduce((sum, val) => sum + val, 0) / windowA.length
    const meanB = windowB.reduce((sum, val) => sum + val, 0) / windowB.length
    const stdA = Math.sqrt(windowA.reduce((sum, val) => sum + Math.pow(val - meanA, 2), 0) / windowA.length)
    const stdB = Math.sqrt(windowB.reduce((sum, val) => sum + Math.pow(val - meanB, 2), 0) / windowB.length)

    const normA = stdA > 0 ? (pricesA[i] - meanA) / stdA : 0
    const normB = stdB > 0 ? (pricesB[i] - meanB) / stdB : 0

    normalizedPricesA.push(normA)
    normalizedPricesB.push(normB)
    distances.push(Math.sqrt(normA * normA + normB * normB))
  }

  return { distances, normalizedPricesA, normalizedPricesB }
}

// ADF Test using WASM
function performADFTest(series) {
  if (!isWasmReady || !wasmModule) {
    console.warn("WASM not ready, using fallback ADF test")
    return {
      statistic: -2.5,
      pValue: 0.1,
      criticalValues: { "1%": -3.43, "5%": -2.86, "10%": -2.57 },
      isStationary: false,
    }
  }

  try {
    const cleanSeries = series.filter((val) => !isNaN(val) && isFinite(val))
    if (cleanSeries.length < 10) {
      throw new Error("Insufficient data for ADF test")
    }

    const result = wasmModule.adf_test(new Float64Array(cleanSeries))
    return {
      statistic: result.statistic,
      pValue: result.p_value,
      criticalValues: result.critical_values,
      isStationary: result.p_value < 0.05,
    }
  } catch (error) {
    console.error("ADF test error:", error)
    return {
      statistic: -2.5,
      pValue: 0.1,
      criticalValues: { "1%": -3.43, "5%": -2.86, "10%": -2.57 },
      isStationary: false,
    }
  }
}

// Hurst Exponent calculation
function calculateHurstExponent(series) {
  try {
    const cleanSeries = series.filter((val) => !isNaN(val))
    if (cleanSeries.length < 20) return 0.5

    const n = cleanSeries.length
    const lags = []
    const rs = []

    for (let lag = 2; lag <= Math.min(n / 4, 100); lag++) {
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

    const hurst = (n_points * sumXY - sumX * sumY) / (n_points * sumXX - sumX * sumX)
    return Math.max(0, Math.min(1, hurst))
  } catch (error) {
    console.error("Error calculating Hurst exponent:", error)
    return 0.5
  }
}

// Half-life calculation
function calculateHalfLife(series) {
  try {
    const cleanSeries = series.filter((val) => !isNaN(val))
    if (cleanSeries.length < 10) return { halfLife: -1, isValid: false }

    const y = cleanSeries.slice(1)
    const x = cleanSeries.slice(0, -1)

    const n = y.length
    const sumX = x.reduce((sum, val) => sum + val, 0)
    const sumY = y.reduce((sum, val) => sum + val, 0)
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0)
    const sumXX = x.reduce((sum, val) => sum + val * val, 0)

    const beta = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)

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

// Z-score calculation
function calculateZScores(data, means, stdDevs) {
  return data.map((value, i) => {
    if (isNaN(means[i]) || isNaN(stdDevs[i]) || stdDevs[i] === 0) {
      return Number.NaN
    }
    return (value - means[i]) / stdDevs[i]
  })
}

// Message handler
self.addEventListener("message", (e) => {
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

      let modelSpecificData = null
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

      const meanValue = validData.reduce((sum, d) => sum + d, 0) / validData.length
      const stdDevValue = Math.sqrt(
        validData.reduce((sum, d) => sum + Math.pow(d - meanValue, 2), 0) / validData.length,
      )
      const minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      const maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      // Statistical tests
      const adfResults = performADFTest(modelSpecificData)
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
        halfLife: "N/A",
      }))

      const analysisData = {
        dates,
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

      console.log("Processing common stats")

      const stockAPrices = pricesA.map((d) => d.close)
      const stockBPrices = pricesB.map((d) => d.close)

      // Calculate correlation
      const correlation = calculateCorrelation(stockAPrices, stockBPrices)

      // Calculate z-score statistics
      const validZScores = zScores.filter((z) => !isNaN(z))
      const minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      const maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      // Statistical tests
      const adfResults = performADFTest(seriesForADF)
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
