/**
 * Calculate z-score for a data point based on its window
 * @param {Array<number>} data - Array of values
 * @returns {number} - Z-score of the last element in the array
 */
export default function calculateZScore(data) {
  if (!data || data.length === 0) return 0

  const mean = data.reduce((sum, val) => sum + val, 0) / data.length
  const stdDev = Math.sqrt(data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length)

  // Return the z-score of the last element
  return stdDev === 0 ? 0 : (data[data.length - 1] - mean) / stdDev
}

/**
 * Calculate z-scores for an entire array using a rolling window
 * @param {Array<number>} data - Full array of values
 * @param {number} windowSize - Size of the rolling window
 * @returns {Array<number>} - Array of z-scores
 */
export function calculateRollingZScores(data, windowSize) {
  const zScores = []

  for (let i = 0; i < data.length; i++) {
    const windowStart = Math.max(0, i - windowSize + 1)
    const window = data.slice(windowStart, i + 1)
    zScores.push(calculateZScore(window))
  }

  return zScores
}
