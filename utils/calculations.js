/**
 * Calculate z-scores for a data array using a specified lookback window
 * @param {Array} data - The array of values to calculate z-scores for
 * @param {number} lookbackWindow - Optional lookback window size (defaults to full array)
 * @return {Array} Array of z-scores
 */
function calculateZScore(data, lookbackWindow = null) {
  if (!data || data.length === 0) return []

  // If no lookback window specified, use the entire dataset
  if (!lookbackWindow || lookbackWindow >= data.length) {
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length
    const stdDev = Math.sqrt(data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length)

    // Avoid division by zero
    if (stdDev === 0) return data.map(() => 0)

    // Calculate z-scores for all values in the data array
    return data.map((val) => (val - mean) / stdDev)
  }

  // Calculate rolling z-scores with lookback window
  const zScores = []

  for (let i = 0; i < data.length; i++) {
    const windowStart = Math.max(0, i - lookbackWindow + 1)
    const windowData = data.slice(windowStart, i + 1)

    const mean = windowData.reduce((sum, val) => sum + val, 0) / windowData.length
    const stdDev = Math.sqrt(windowData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / windowData.length)

    // Avoid division by zero
    const zScore = stdDev === 0 ? 0 : (data[i] - mean) / stdDev
    zScores.push(zScore)
  }

  return zScores
}

export default calculateZScore
