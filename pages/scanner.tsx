"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/router"
import { getAllWatchlists } from "../lib/indexedDB"
import { getStockData } from "../lib/indexedDB"
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react"

export default function Scanner() {
  const router = useRouter()
  const [watchlists, setWatchlists] = useState([])
  const [selectedWatchlist, setSelectedWatchlist] = useState("all")
  const [method, setMethod] = useState("ratio")
  const [lookbackPeriod, setLookbackPeriod] = useState(60)
  const [minZScore, setMinZScore] = useState(2.0)
  const [maxZScore, setMaxZScore] = useState(4.0)
  const [isScanning, setIsScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [totalPairs, setTotalPairs] = useState(0)
  const [processedPairs, setProcessedPairs] = useState(0)
  const [scanResults, setScanResults] = useState([])
  const [error, setError] = useState(null)

  // Fetch watchlists on component mount
  useEffect(() => {
    async function fetchWatchlists() {
      try {
        const allWatchlists = await getAllWatchlists()
        setWatchlists(allWatchlists || [])
      } catch (err) {
        console.error("Error fetching watchlists:", err)
        setError("Failed to load watchlists. Please check your database connection.")
      }
    }

    fetchWatchlists()
  }, [])

  // Start scanning process
  const handleScan = async () => {
    setIsScanning(true)
    setProgress(0)
    setProcessedPairs(0)
    setScanResults([])
    setError(null)

    try {
      // Get all pairs to scan
      let pairsToScan = []

      if (selectedWatchlist === "all") {
        // Collect all pairs from all watchlists
        watchlists.forEach((watchlist) => {
          watchlist.pairs.forEach((pair) => {
            pairsToScan.push({
              ...pair,
              watchlistName: watchlist.name,
              watchlistId: watchlist.id,
            })
          })
        })
      } else {
        // Get pairs from selected watchlist
        const selectedList = watchlists.find((w) => w.id === selectedWatchlist)
        if (selectedList) {
          pairsToScan = selectedList.pairs.map((pair) => ({
            ...pair,
            watchlistName: selectedList.name,
            watchlistId: selectedList.id,
          }))
        }
      }

      // Remove duplicates (same pair might be in multiple watchlists)
      if (selectedWatchlist === "all") {
        const uniquePairs = {}
        pairsToScan = pairsToScan.filter((pair) => {
          const pairKey = `${pair.stockA}-${pair.stockB}`
          if (!uniquePairs[pairKey]) {
            uniquePairs[pairKey] = true
            return true
          }
          return false
        })
      }

      setTotalPairs(pairsToScan.length)

      if (pairsToScan.length === 0) {
        setError("No pairs found in the selected watchlist(s).")
        setIsScanning(false)
        return
      }

      // Process each pair
      const results = []

      for (let i = 0; i < pairsToScan.length; i++) {
        const pair = pairsToScan[i]

        // Update progress
        setProcessedPairs(i + 1)
        setProgress(Math.round(((i + 1) / pairsToScan.length) * 100))

        try {
          // Fetch stock data
          const stockAData = await getStockData(pair.stockA)
          const stockBData = await getStockData(pair.stockB)

          if (!stockAData || !stockBData || stockAData.length === 0 || stockBData.length === 0) {
            console.warn(`Missing data for pair ${pair.stockA}/${pair.stockB}`)
            continue
          }

          // Ensure data is sorted by date (ascending)
          const sortedStockAData = [...stockAData].sort((a, b) => new Date(a.date) - new Date(b.date))
          const sortedStockBData = [...stockBData].sort((a, b) => new Date(a.date) - new Date(b.date))

          // Get the most recent lookback period data
          const recentStockAData = sortedStockAData.slice(-lookbackPeriod)
          const recentStockBData = sortedStockBData.slice(-lookbackPeriod)

          // Ensure we have enough data points
          if (recentStockAData.length < lookbackPeriod || recentStockBData.length < lookbackPeriod) {
            console.warn(`Insufficient data for pair ${pair.stockA}/${pair.stockB}`)
            continue
          }

          // Calculate spread based on selected method
          const { zScore, correlation, halfLife, signal } = calculatePairMetrics(
            recentStockAData,
            recentStockBData,
            method,
          )

          // Check if z-score is within the specified range (absolute value)
          const absZScore = Math.abs(zScore)
          if (absZScore >= minZScore && absZScore <= maxZScore) {
            results.push({
              stockA: pair.stockA,
              stockB: pair.stockB,
              watchlistName: pair.watchlistName,
              watchlistId: pair.watchlistId,
              zScore,
              correlation,
              halfLife,
              signal,
              method,
              lastPriceA: recentStockAData[recentStockAData.length - 1].close,
              lastPriceB: recentStockBData[recentStockBData.length - 1].close,
              lastDate: recentStockAData[recentStockAData.length - 1].date,
            })
          }
        } catch (err) {
          console.error(`Error processing pair ${pair.stockA}/${pair.stockB}:`, err)
        }
      }

      // Sort results by absolute z-score (descending)
      results.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))

      setScanResults(results)
    } catch (err) {
      console.error("Error during scanning:", err)
      setError("An error occurred during scanning. Please try again.")
    } finally {
      setIsScanning(false)
    }
  }

  // Calculate pair metrics based on selected method
  const calculatePairMetrics = (stockAData, stockBData, method) => {
    // Extract closing prices
    const pricesA = stockAData.map((d) => d.close)
    const pricesB = stockBData.map((d) => d.close)

    // Calculate correlation
    const correlation = calculateCorrelation(pricesA, pricesB)

    let spread = []
    let zScore = 0
    let halfLife = null

    // Calculate spread based on method
    if (method === "ratio") {
      // Ratio method
      spread = pricesA.map((price, i) => price / pricesB[i])
    } else if (method === "ols") {
      // OLS regression method
      const { slope, intercept } = calculateOLS(pricesA, pricesB)
      spread = pricesA.map((price, i) => price - (slope * pricesB[i] + intercept))
    } else if (method === "kalman") {
      // Kalman filter method (simplified implementation)
      const { slope, intercept } = calculateKalmanFilter(pricesA, pricesB)
      spread = pricesA.map((price, i) => price - (slope * pricesB[i] + intercept))
    }

    // Calculate z-score of the spread
    const mean = spread.reduce((sum, val) => sum + val, 0) / spread.length
    const stdDev = Math.sqrt(spread.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / spread.length)

    zScore = (spread[spread.length - 1] - mean) / stdDev

    // Calculate half-life
    try {
      halfLife = calculateHalfLife(spread)
    } catch (err) {
      console.warn("Half-life calculation failed:", err)
      halfLife = null
    }

    // Determine signal
    let signal = "None"
    const stockASymbol = stockAData[0].symbol || stockAData[0].stockA
    const stockBSymbol = stockBData[0].symbol || stockBData[0].stockB
    if (zScore > 0) {
      signal = `Short ${stockASymbol} / Long ${stockBSymbol}`
    } else if (zScore < 0) {
      signal = `Long ${stockASymbol} / Short ${stockBSymbol}`
    }

    return { zScore, correlation, halfLife, signal }
  }

  // Calculate correlation between two arrays
  const calculateCorrelation = (x, y) => {
    const n = x.length
    let sumX = 0
    let sumY = 0
    let sumXY = 0
    let sumX2 = 0
    let sumY2 = 0

    for (let i = 0; i < n; i++) {
      sumX += x[i]
      sumY += y[i]
      sumXY += x[i] * y[i]
      sumX2 += x[i] * x[i]
      sumY2 += y[i] * y[i]
    }

    const numerator = n * sumXY - sumX * sumY
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))

    return denominator === 0 ? 0 : numerator / denominator
  }

  // Calculate OLS regression
  const calculateOLS = (y, x) => {
    const n = x.length
    let sumX = 0
    let sumY = 0
    let sumXY = 0
    let sumX2 = 0

    for (let i = 0; i < n; i++) {
      sumX += x[i]
      sumY += y[i]
      sumXY += x[i] * y[i]
      sumX2 += x[i] * x[i]
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n

    return { slope, intercept }
  }

  // Calculate Kalman filter (simplified implementation)
  const calculateKalmanFilter = (y, x) => {
    // For simplicity, we'll use OLS as an approximation
    // In a real implementation, this would be a proper Kalman filter
    return calculateOLS(y, x)
  }

  // Calculate half-life of mean reversion
  const calculateHalfLife = (spread) => {
    const laggedSpread = spread.slice(0, -1)
    const deltaSpread = spread.slice(1).map((val, i) => val - laggedSpread[i])

    // Perform linear regression: deltaSpread = beta * laggedSpread + error
    let sumX = 0
    let sumY = 0
    let sumXY = 0
    let sumX2 = 0

    for (let i = 0; i < laggedSpread.length; i++) {
      sumX += laggedSpread[i]
      sumY += deltaSpread[i]
      sumXY += laggedSpread[i] * deltaSpread[i]
      sumX2 += laggedSpread[i] * laggedSpread[i]
    }

    const beta = (laggedSpread.length * sumXY - sumX * sumY) / (laggedSpread.length * sumX2 - sumX * sumX)

    // Calculate half-life: -log(2) / log(1 + beta)
    if (beta >= 0) {
      return null // No mean reversion
    }

    return Math.round(-Math.log(2) / Math.log(1 + beta))
  }

  // Format z-score for display
  const formatZScore = (zScore) => {
    return zScore.toFixed(2)
  }

  // Get color for z-score
  const getZScoreColor = (zScore) => {
    const absZScore = Math.abs(zScore)
    if (absZScore >= 3) return "text-red-400 font-bold"
    if (absZScore >= 2) return "text-gold-400 font-semibold"
    return "text-gray-300"
  }

  // Get color for correlation
  const getCorrelationColor = (correlation) => {
    const absCorr = Math.abs(correlation)
    if (absCorr >= 0.8) return "text-green-400 font-semibold"
    if (absCorr >= 0.5) return "text-gold-400"
    return "text-red-400"
  }

  // Get color for half-life
  const getHalfLifeColor = (halfLife) => {
    if (halfLife === null) return "text-red-400"
    if (halfLife <= 30) return "text-green-400 font-semibold"
    if (halfLife <= 60) return "text-gold-400"
    return "text-red-400"
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-bold text-white">Pair Scanner</h1>
        <p className="text-xl text-gray-300">
          Scan for trading opportunities across watchlists using statistical analysis
        </p>
      </div>

      <div className="card">
        <h2 className="text-2xl font-bold text-white mb-6">Scanner Parameters</h2>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-md text-red-300 flex items-center">
            <AlertCircle className="h-5 w-5 mr-2" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div>
            <label className="block text-base font-medium text-gray-300 mb-2">Watchlist Selection</label>
            <select
              value={selectedWatchlist}
              onChange={(e) => setSelectedWatchlist(e.target.value)}
              disabled={isScanning}
              className="input-field"
            >
              <option value="all">All Watchlists</option>
              {watchlists.map((watchlist) => (
                <option key={watchlist.id} value={watchlist.id}>
                  {watchlist.name} ({watchlist.pairs?.length || 0} pairs)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-base font-medium text-gray-300 mb-2">Analysis Method</label>
            <div className="flex space-x-6">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="ratio"
                  checked={method === "ratio"}
                  onChange={() => setMethod("ratio")}
                  disabled={isScanning}
                  className="mr-2 text-gold-400 focus:ring-gold-400"
                />
                <span className="text-gray-300">Ratio</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="ols"
                  checked={method === "ols"}
                  onChange={() => setMethod("ols")}
                  disabled={isScanning}
                  className="mr-2 text-gold-400 focus:ring-gold-400"
                />
                <span className="text-gray-300">OLS</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="kalman"
                  checked={method === "kalman"}
                  onChange={() => setMethod("kalman")}
                  disabled={isScanning}
                  className="mr-2 text-gold-400 focus:ring-gold-400"
                />
                <span className="text-gray-300">Kalman</span>
              </label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <label className="block text-base font-medium text-gray-300 mb-2">Lookback Period (Days)</label>
            <input
              type="number"
              value={lookbackPeriod}
              onChange={(e) => setLookbackPeriod(Number.parseInt(e.target.value))}
              min={10}
              max={252}
              disabled={isScanning}
              className="input-field"
            />
            <p className="mt-1 text-sm text-gray-400">Number of days for statistical calculations</p>
          </div>

          <div>
            <label className="block text-base font-medium text-gray-300 mb-2">Z-Score Range (Min)</label>
            <input
              type="number"
              value={minZScore}
              onChange={(e) => setMinZScore(Number.parseFloat(e.target.value))}
              min={0}
              max={10}
              step={0.1}
              disabled={isScanning}
              className="input-field"
            />
            <p className="mt-1 text-sm text-gray-400">Minimum absolute z-score threshold</p>
          </div>

          <div>
            <label className="block text-base font-medium text-gray-300 mb-2">Z-Score Range (Max)</label>
            <input
              type="number"
              value={maxZScore}
              onChange={(e) => setMaxZScore(Number.parseFloat(e.target.value))}
              min={0}
              max={10}
              step={0.1}
              disabled={isScanning}
              className="input-field"
            />
            <p className="mt-1 text-sm text-gray-400">Maximum absolute z-score threshold</p>
          </div>
        </div>

        {isScanning && (
          <div className="mb-8">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-300">
                Processing: {processedPairs} of {totalPairs} pairs
              </span>
              <span className="text-gold-400">{progress}%</span>
            </div>
            <div className="w-full bg-navy-800 rounded-full h-2">
              <div
                className="bg-gold-400 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        <div className="flex justify-center">
          <button onClick={handleScan} disabled={isScanning || watchlists.length === 0} className="btn-primary">
            {isScanning ? (
              <span className="flex items-center">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Scanning...
              </span>
            ) : (
              "Scan Pairs"
            )}
          </button>
        </div>
      </div>

      {scanResults.length > 0 && (
        <div className="card">
          <h2 className="text-2xl font-bold text-white mb-6">
            Scan Results
            <span className="ml-3 px-3 py-1 bg-gold-400/20 text-gold-400 rounded-full text-sm font-medium">
              {scanResults.length} pairs found
            </span>
          </h2>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-navy-700">
              <thead className="bg-navy-800">
                <tr>
                  <th className="table-header">Pair</th>
                  <th className="table-header">Watchlist</th>
                  <th className="table-header">Z-Score</th>
                  <th className="table-header">Signal</th>
                  <th className="table-header">Correlation</th>
                  <th className="table-header">Half-Life</th>
                  <th className="table-header">Last Prices</th>
                  <th className="table-header">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800">
                {scanResults.map((result, index) => (
                  <tr
                    key={`${result.stockA}-${result.stockB}-${index}`}
                    className={index % 2 === 0 ? "bg-navy-900/50" : "bg-navy-900/30"}
                  >
                    <td className="table-cell">
                      <div className="font-medium text-white">
                        {result.stockA} / {result.stockB}
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className="px-2 py-1 bg-navy-700 text-gray-300 rounded text-sm">
                        {result.watchlistName}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className={getZScoreColor(result.zScore)}>{formatZScore(result.zScore)}</span>
                    </td>
                    <td className="table-cell">
                      <span
                        className={`px-2 py-1 rounded text-sm font-medium ${
                          result.zScore > 0 ? "bg-red-900/30 text-red-300" : "bg-green-900/30 text-green-300"
                        }`}
                      >
                        {result.signal}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className={getCorrelationColor(result.correlation)}>{result.correlation.toFixed(2)}</span>
                    </td>
                    <td className="table-cell">
                      <span className={getHalfLifeColor(result.halfLife)}>
                        {result.halfLife !== null ? `${result.halfLife} days` : "N/A"}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="text-sm">
                        <div>
                          {result.stockA}: ${result.lastPriceA.toFixed(2)}
                        </div>
                        <div>
                          {result.stockB}: ${result.lastPriceB.toFixed(2)}
                        </div>
                      </div>
                    </td>
                    <td className="table-cell">
                      <Link
                        href={`/pair-analyzer?stockA=${result.stockA}&stockB=${result.stockB}`}
                        className="text-gold-400 hover:text-gold-300 flex items-center font-medium"
                      >
                        Analyze <ExternalLink className="h-4 w-4 ml-1" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isScanning && scanResults.length === 0 && processedPairs > 0 && (
        <div className="card">
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-2">No pairs found</div>
            <p className="text-gray-500">
              No pairs matched the specified z-score range of {minZScore} to {maxZScore}. Try adjusting the parameters
              and scanning again.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
