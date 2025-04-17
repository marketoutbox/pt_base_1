export default function calculateZScore(values) {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length
  const stdDev = Math.sqrt(values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length)
  return values.map((val) => (val - mean) / stdDev)
}
