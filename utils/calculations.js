/**
 * Calculate ratio model statistics for pair trading
 * @param {Array} stockA First stock data
 * @param {Array} stockB Second stock data
 * @returns {Object} Object containing ratio model statistics
 */
export function calculateRatioModel(stockA, stockB) {
  if (!stockA?.length || !stockB?.length) {
    return {
      ratios: [],
      mean: 0,
      stdDev: 0,
      zScores: [],
      halfLife: 0,
      currentRatio: 0,
      currentZScore: 0,
    }
  }

  // Ensure both arrays have the same length and are sorted by date
  const sortedA = [...stockA].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const sortedB = [...stockB].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Calculate price ratios (Stock A / Stock B)
  const ratios = sortedA
    .map((itemA, index) => {
      const itemB = sortedB[index]
      if (!itemB || itemB.close === 0 || itemB.close === undefined) return null
      return itemA.close / itemB.close
    })
    .filter((ratio) => ratio !== null)

  if (ratios.length === 0) {
    return {
      ratios: [],
      mean: 0,
      stdDev: 0,
      zScores: [],
      halfLife: 0,
      currentRatio: 0,
      currentZScore: 0,
    }
  }

  // Calculate mean of ratios
  const mean = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length

  // Calculate standard deviation
  const squaredDiffs = ratios.map((ratio) => Math.pow(ratio - mean, 2))
  const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / ratios.length
  const stdDev = Math.sqrt(variance)

  // Calculate z-scores
  const zScores = ratios.map((ratio) => (ratio - mean) / (stdDev || 1)) // Avoid division by zero

  // Calculate half-life of mean reversion
  const halfLife = calculateHalfLife(ratios)

  // Current values
  const currentRatio = ratios[ratios.length - 1] || 0
  const currentZScore = zScores[zScores.length - 1] || 0

  return {
    ratios,
    mean,
    stdDev,
    zScores,
    halfLife,
    currentRatio,
    currentZScore,
  }
}

/**
 * Calculate the half-life of mean reversion for a time series
 * @param {Array<number>} timeSeries Array of values
 * @returns {number} Half-life value in periods
 */
function calculateHalfLife(timeSeries) {
  if (timeSeries.length < 2) return 0

  // Create lagged series (y and x)
  const y = []
  const x = []

  for (let i = 1; i < timeSeries.length; i++) {
    y.push(timeSeries[i] - timeSeries[i - 1]) // Price changes
    x.push(timeSeries[i - 1]) // Lagged price levels
  }

  // Calculate OLS regression
  const n = y.length
  const sumX = x.reduce((sum, val) => sum + val, 0)
  const sumY = y.reduce((sum, val) => sum + val, 0)
  const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0)
  const sumXX = x.reduce((sum, val) => sum + val * val, 0)

  const meanX = sumX / n
  const meanY = sumY / n

  const slope = (sumXY - sumX * meanY) / (sumXX - sumX * meanX)

  // Calculate half-life: -log(2) / log(1 + slope)
  // If slope is positive or zero, there's no mean reversion
  if (slope >= 0) return 0

  const halfLife = -Math.log(2) / Math.log(1 + slope)

  // Return a reasonable value, capped to avoid extreme results
  return isNaN(halfLife) || !isFinite(halfLife) ? 0 : Math.min(Math.max(halfLife, 0), 100)
}

/**
 * Get trading signals based on z-score thresholds
 * @param {number} zScore Current z-score
 * @param {number} entryThreshold Z-score threshold for entry (positive value)
 * @param {number} exitThreshold Z-score threshold for exit (positive value)
 * @returns {Object} Trading signal object
 */
export function getRatioModelSignal(zScore, entryThreshold = 2, exitThreshold = 0.5) {
  const absZScore = Math.abs(zScore)

  if (zScore > entryThreshold) {
    return { signal: "SELL", strength: absZScore / entryThreshold }
  } else if (zScore < -entryThreshold) {
    return { signal: "BUY", strength: absZScore / entryThreshold }
  } else if (absZScore < exitThreshold) {
    return { signal: "EXIT", strength: 1 - absZScore / exitThreshold }
  } else {
    return { signal: "HOLD", strength: 0 }
  }
}
