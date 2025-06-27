// Ratio Calculations Worker
// This worker handles ratio model calculations

console.log("Ratio calculations worker started")

let wasmModule = null
let isWasmReady = false

// Load WASM module
async function loadWasm() {
  try {
    console.log("Loading WASM module in ratio worker...")
    const wasmScript = await import("/wasm/adf_test_pkg/adf_test.js")
    await wasmScript.default() // Initialize the WASM module
    wasmModule = wasmScript
    isWasmReady = true
    console.log("WASM module loaded successfully in ratio worker")
  } catch (error) {
    console.error("Failed to load WASM module in ratio worker:", error)
    isWasmReady = false
    self.postMessage({
      type: "error",
      message: `WASM initialization failed in ratio worker: ${error.message || error}`,
    })
  }
}

// Initialize WASM on worker startup
loadWasm()

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
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (slice.length - 1) // Bessel's correction
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
    const cleanSeries = series.filter((val) => !isNaN(val) && isFinite(val))
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

// Message handler
self.addEventListener("message", async (e) => {
  console.log("Ratio worker received message:", e.data.type)

  try {
    if (e.data.type === "runRatioAnalysis") {
      const { pricesA, pricesB } = e.data.data
      const { ratioLookbackWindow, entryThreshold, exitThreshold } = e.data.params // Destructure new params

      console.log("Processing ratio analysis with", pricesA.length, "data points")

      // Extract price arrays
      const stockAPrices = pricesA.map((d) => d.close)
      const stockBPrices = pricesB.map((d) => d.close)
      const dates = pricesA.map((d) => d.date)

      // Calculate ratios
      const ratios = stockAPrices.map((priceA, i) => priceA / stockBPrices[i])

      // Calculate rolling statistics
      const rollingMean = calculateRollingMean(ratios, ratioLookbackWindow)
      const rollingStdDev = calculateRollingStdDev(ratios, ratioLookbackWindow)

      // Calculate z-scores
      const zScores = calculateZScores(ratios, rollingMean, rollingStdDev)

      // Calculate rolling half-lives (simplified)
      const rollingHalfLifes = ratios.map((_, i) => {
        if (i < ratioLookbackWindow) return "N/A"
        const window = ratios.slice(Math.max(0, i - ratioLookbackWindow + 1), i + 1)
        const { halfLife } = calculateHalfLife(window)
        return halfLife > 0 ? halfLife.toFixed(1) : "N/A"
      })

      // Calculate overall statistics
      const validRatios = ratios.filter((r) => !isNaN(r))
      const validZScores = zScores.filter((z) => !isNaN(z))

      const meanRatio = validRatios.length > 0 ? validRatios.reduce((sum, r) => sum + r, 0) / validRatios.length : 0
      const stdDevRatio =
        validRatios.length > 0
          ? Math.sqrt(validRatios.reduce((sum, r) => sum + Math.pow(r - meanRatio, 2), 0) / (validRatios.length - 1)) // Bessel's correction
          : 0
      const minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      const maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      // Calculate common statistical tests
      const correlation = calculateCorrelation(stockAPrices, stockBPrices)
      const adfResults = await performADFTest(ratios) // ADF on ratios
      const { halfLife, isValid: halfLifeValid } = calculateHalfLife(ratios)
      const hurstExponent = calculateHurstExponent(ratios)
      const practicalTradeHalfLife = calculatePracticalTradeHalfLife(zScores, entryThreshold, exitThreshold)

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
        ratio: ratios[i],
        zScore: zScores[i],
        halfLife: rollingHalfLifes[i],
      }))

      const analysisData = {
        dates,
        ratios,
        zScores,
        stockAPrices,
        stockBPrices,
        statistics: {
          meanRatio,
          stdDevRatio,
          minZScore,
          maxZScore,
          halfLife,
          halfLifeValid,
          modelType: "ratio",
          correlation, // Now calculated here
          adfResults, // Now calculated here
          hurstExponent, // Now calculated here
          practicalTradeHalfLife, // Now calculated here
        },
        tableData,
        chartData,
      }

      console.log("Ratio analysis completed, sending results")
      self.postMessage({
        type: "ratioAnalysisComplete",
        analysisData,
      })
    } else {
      console.warn("Unknown message type:", e.data.type)
    }
  } catch (error) {
    console.error("Error in ratio worker:", error)
    self.postMessage({
      type: "ratioAnalysisComplete",
      error: error.message,
      analysisData: null, // Ensure analysisData is null on error
    })
  }
})

self.addEventListener("error", (error) => {
  console.error("Ratio worker error:", error)
  self.postMessage({
    type: "error",
    message: error.message,
  })
})
