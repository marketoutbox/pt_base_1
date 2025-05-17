// Update the calculateZScoreExplicit function to be more explicit about data ordering
function calculateZScoreExplicit(data, targetIndex = null) {
  if (!data || data.length === 0) return 0

  // Ensure we're working with a valid window
  const mean = data.reduce((sum, val) => sum + val, 0) / data.length
  const stdDev = Math.sqrt(data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length)

  // If targetIndex is provided, use that element, otherwise use the last element
  const targetValue = targetIndex !== null ? data[targetIndex] : data[data.length - 1]

  // Return the z-score of the target element
  return stdDev === 0 ? 0 : (targetValue - mean) / stdDev
}

/**
 * Calculate z-scores for an entire array using a rolling window
 * @param {Array<number>} data - Full array of values (sorted oldest to newest)
 * @param {number} windowSize - Size of the rolling window
 * @returns {Array<number>} - Array of z-scores
 */
export function calculateRollingZScores(data, windowSize) {
  console.log(`Calculating rolling z-scores with window size ${windowSize} for ${data.length} data points`)

  const zScores = []

  for (let i = 0; i < data.length; i++) {
    // For each point, create a window of the previous windowSize points (or fewer if at the beginning)
    const windowStart = Math.max(0, i - windowSize + 1)
    const window = data.slice(windowStart, i + 1)

    // Calculate z-score for the current point (which is the last in the window)
    const currentValue = data[i]
    const zScore = calculateZScoreExplicit(window, window.length - 1)

    // Log every 50th calculation for debugging
    if (i % 50 === 0) {
      console.log(`Point ${i}: window size = ${window.length}, z-score = ${zScore.toFixed(4)}`)
    }

    zScores.push(zScore)
  }

  return zScores
}

// Export the function as default
export default calculateZScoreExplicit
