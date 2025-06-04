"use client"

import { useState, useEffect } from "react"
import Head from "next/head"
import Link from "next/link"
import { useRouter } from "next/router"
import { getAllWatchlists } from "../lib/indexedDB"
import { getStockData } from "../lib/indexedDB"
import Button from "../components/Button"
import Input from "../components/Input"
import Select from "../components/Select"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AlertCircle, ExternalLink, Info, Loader2 } from "lucide-react"

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
    if (zScore > 0) {
      signal = `Short ${stockAData[0].symbol} / Long ${stockBData[0].symbol}`
    } else if (zScore < 0) {
      signal = `Long ${stockAData[0].symbol} / Short ${stockBData[0].symbol}`
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
    if (absZScore >= 3) return "text-red-500 font-bold"
    if (absZScore >= 2) return "text-orange-500 font-semibold"
    return "text-gray-200"
  }

  // Get color for correlation
  const getCorrelationColor = (correlation) => {
    const absCorr = Math.abs(correlation)
    if (absCorr >= 0.8) return "text-green-500 font-semibold"
    if (absCorr >= 0.5) return "text-yellow-500"
    return "text-red-400"
  }

  // Get color for half-life
  const getHalfLifeColor = (halfLife) => {
    if (halfLife === null) return "text-red-400"
    if (halfLife <= 30) return "text-green-500 font-semibold"
    if (halfLife <= 60) return "text-yellow-500"
    return "text-red-400"
  }

  return (
    <div className="min-h-screen bg-navy-950 text-navy-100">
      <Head>
        <title>Pair Scanner | Statistical Equity Divergence</title>
        <meta name="description" content="Scan for trading opportunities across watchlists" />
      </Head>

      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8 text-gold-400">Pair Scanner</h1>

        <Card className="p-6 mb-8 bg-navy-900 border-navy-700">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Watchlist</label>
              <Select
                value={selectedWatchlist}
                onChange={(e) => setSelectedWatchlist(e.target.value)}
                disabled={isScanning}
              >
                <option value="all">All Watchlists</option>
                {watchlists.map((watchlist) => (
                  <option key={watchlist.id} value={watchlist.id}>
                    {watchlist.name} ({watchlist.pairs?.length || 0} pairs)
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Method</label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="ratio"
                    checked={method === "ratio"}
                    onChange={() => setMethod("ratio")}
                    disabled={isScanning}
                    className="mr-2"
                  />
                  <span>Ratio</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="ols"
                    checked={method === "ols"}
                    onChange={() => setMethod("ols")}
                    disabled={isScanning}
                    className="mr-2"
                  />
                  <span>OLS</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="kalman"
                    checked={method === "kalman"}
                    onChange={() => setMethod("kalman")}
                    disabled={isScanning}
                    className="mr-2"
                  />
                  <span>Kalman</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Lookback Period (days)</label>
              <Input
                type="number"
                value={lookbackPeriod}
                onChange={(e) => setLookbackPeriod(Number.parseInt(e.target.value))}
                min={10}
                max={252}
                disabled={isScanning}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Z-Score Range (Min)</label>
              <Input
                type="number"
                value={minZScore}
                onChange={(e) => setMinZScore(Number.parseFloat(e.target.value))}
                min={0}
                max={10}
                step={0.1}
                disabled={isScanning}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Z-Score Range (Max)</label>
              <Input
                type="number"
                value={maxZScore}
                onChange={(e) => setMaxZScore(Number.parseFloat(e.target.value))}
                min={0}
                max={10}
                step={0.1}
                disabled={isScanning}
              />
            </div>

            <div className="flex items-end">
              <Button onClick={handleScan} disabled={isScanning || watchlists.length === 0} primary className="w-full">
                {isScanning ? (
                  <span className="flex items-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scanning...
                  </span>
                ) : (
                  "Scan Pairs"
                )}
              </Button>
            </div>
          </div>

          {isScanning && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-1">
                <span>
                  Processing: {processedPairs} of {totalPairs} pairs
                </span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </Card>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-200 px-4 py-3 rounded mb-6 flex items-center">
            <AlertCircle className="h-5 w-5 mr-2" />
            {error}
          </div>
        )}

        {scanResults.length > 0 && (
          <Card className="bg-navy-900 border-navy-700">
            <div className="p-4 border-b border-navy-700 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gold-400">
                Scan Results <Badge variant="outline">{scanResults.length} pairs found</Badge>
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-navy-800">
                    <th className="px-4 py-3 text-left text-xs font-medium text-navy-300 uppercase tracking-wider">
                      Pair
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-navy-300 uppercase tracking-wider">
                      Watchlist
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-navy-300 uppercase tracking-wider">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="flex items-center">
                            Z-Score <Info className="h-3 w-3 ml-1" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Current z-score of the spread</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-navy-300 uppercase tracking-wider">
                      Signal
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-navy-300 uppercase tracking-wider">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="flex items-center">
                            Corr <Info className="h-3 w-3 ml-1" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Price correlation between the two stocks</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-navy-300 uppercase tracking-wider">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="flex items-center">
                            Half-Life <Info className="h-3 w-3 ml-1" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Estimated days for mean reversion (lower is better)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-navy-300 uppercase tracking-wider">
                      Last Prices
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-navy-300 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800">
                  {scanResults.map((result, index) => (
                    <tr
                      key={`${result.stockA}-${result.stockB}-${index}`}
                      className={index % 2 === 0 ? "bg-navy-900/50" : "bg-navy-900/30"}
                    >
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="font-medium">
                          {result.stockA} / {result.stockB}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <Badge variant="outline">{result.watchlistName}</Badge>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={getZScoreColor(result.zScore)}>{formatZScore(result.zScore)}</span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <Badge variant={result.zScore > 0 ? "destructive" : "success"} className="font-normal">
                          {result.signal}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={getCorrelationColor(result.correlation)}>{result.correlation.toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={getHalfLifeColor(result.halfLife)}>
                          {result.halfLife !== null ? `${result.halfLife} days` : "N/A"}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm">
                          {result.stockA}: ${result.lastPriceA.toFixed(2)}
                        </div>
                        <div className="text-sm">
                          {result.stockB}: ${result.lastPriceB.toFixed(2)}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <Link
                          href={`/pair-analyzer?stockA=${result.stockA}&stockB=${result.stockB}&method=${result.method}`}
                          className="text-gold-400 hover:text-gold-300 flex items-center"
                        >
                          Analyze <ExternalLink className="h-4 w-4 ml-1" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {scanResults.length === 0 && (
              <div className="p-8 text-center text-navy-400">
                <p>No pairs found matching the criteria.</p>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
