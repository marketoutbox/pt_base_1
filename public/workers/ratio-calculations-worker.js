// Ratio Calculations Worker
// This worker handles ratio model calculations

console.log("Ratio calculations worker started")

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

// Message handler
self.addEventListener("message", (e) => {
  console.log("Ratio worker received message:", e.data.type)

  try {
    if (e.data.type === "runRatioAnalysis") {
      const { pricesA, pricesB } = e.data.data
      const { ratioLookbackWindow } = e.data.params

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
          ? Math.sqrt(validRatios.reduce((sum, r) => sum + Math.pow(r - meanRatio, 2), 0) / validRatios.length)
          : 0
      const minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      const maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      // Calculate half-life
      const { halfLife, isValid: halfLifeValid } = calculateHalfLife(ratios)

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
          // These will be filled by the main worker's common stats
          correlation: 0,
          adfResults: { statistic: 0, pValue: 1, criticalValues: { "1%": 0, "5%": 0, "10%": 0 }, isStationary: false },
          hurstExponent: 0.5,
          practicalTradeHalfLife: { tradeCycleLength: 0, successRate: 0, isValid: false },
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
