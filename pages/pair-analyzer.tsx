"use client"

import { useState, useEffect } from "react"
import { openDB } from "idb"
import calculateZScoreExplicit from "../utils/calculations"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
} from "recharts"

export default function PairAnalyzer() {
  const [stocks, setStocks] = useState([])
  const [selectedPair, setSelectedPair] = useState({ stockA: "", stockB: "" })
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [activeTab, setActiveTab] = useState("ratio") // 'ratio', 'ols', or 'kalman'

  // Shared parameters
  const [zScoreLookback, setZScoreLookback] = useState(30)

  // Trade parameters for practical half-life calculation
  const [entryThreshold, setEntryThreshold] = useState(2.0)
  const [exitThreshold, setExitThreshold] = useState(0.5)

  // Ratio model parameters
  const [ratioLookbackWindow, setRatioLookbackWindow] = useState(60)

  // OLS model parameters
  const [olsLookbackWindow, setOlsLookbackWindow] = useState(60)

  // Kalman filter parameters
  const [kalmanLookbackWindow, setKalmanLookbackWindow] = useState(60)
  const [kalmanProcessNoise, setKalmanProcessNoise] = useState(0.01)
  const [kalmanMeasurementNoise, setKalmanMeasurementNoise] = useState(0.1)

  const [plotType, setPlotType] = useState("line")
  const [isLoading, setIsLoading] = useState(false)
  const [analysisData, setAnalysisData] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchStocks = async () => {
      try {
        const db = await openDB("StockDatabase", 2)
        const tx = db.transaction("stocks", "readonly")
        const store = tx.objectStore("stocks")
        const allStocks = await store.getAll()
        if (!allStocks.length) return
        setStocks(allStocks.map((stock) => stock.symbol))

        // Set default date range
        const today = new Date()
        const oneYearAgo = new Date()
        oneYearAgo.setFullYear(today.getFullYear() - 1)
        setFromDate(oneYearAgo.toISOString().split("T")[0])
        setToDate(today.toISOString().split("T")[0])

        // Check for URL parameters
        const urlParams = new URLSearchParams(window.location.search)
        const stockA = urlParams.get("stockA")
        const stockB = urlParams.get("stockB")

        if (stockA && stockB) {
          setSelectedPair({
            stockA,
            stockB,
          })
        }
      } catch (error) {
        console.error("Error fetching stocks:", error)
        setError("Failed to load stock data. Please try again.")
      }
    }
    fetchStocks()
  }, [])

  const handleSelection = (event) => {
    const { name, value } = event.target
    setSelectedPair((prev) => ({ ...prev, [name]: value }))
  }

  const filterByDate = (data) => {
    return data.filter((entry) => entry.date >= fromDate && entry.date <= toDate)
  }

  // OLS regression for hedge ratio calculation
  const calculateHedgeRatio = (pricesA, pricesB, currentIndex, windowSize) => {
    const startIdx = Math.max(0, currentIndex - windowSize + 1)
    const endIdx = currentIndex + 1

    let sumA = 0,
      sumB = 0,
      sumAB = 0,
      sumB2 = 0
    let count = 0

    for (let i = startIdx; i < endIdx; i++) {
      sumA += pricesA[i].close
      sumB += pricesB[i].close
      sumAB += pricesA[i].close * pricesB[i].close
      sumB2 += pricesB[i].close * pricesB[i].close
      count++
    }

    // Avoid division by zero
    if (count === 0 || count * sumB2 - sumB * sumB === 0) return { beta: 1, alpha: 0 }

    // Calculate beta (slope)
    const beta = (count * sumAB - sumA * sumB) / (count * sumB2 - sumB * sumB)

    // Calculate alpha (intercept)
    const meanA = sumA / count
    const meanB = sumB / count
    const alpha = meanA - beta * meanB

    return { beta, alpha }
  }

  // Kalman filter implementation for hedge ratio estimation
  const kalmanFilter = (pricesA, pricesB, processNoise = 0.01, measurementNoise = 0.1) => {
    const n = pricesA.length

    // Initialize state and covariance
    let x = 1.0 // Initial hedge ratio estimate
    let P = 1.0 // Initial error covariance

    const hedgeRatios = []
    const alphas = []

    // Process each data point
    for (let i = 0; i < n; i++) {
      // Prediction step
      // x = x (state doesn't change in prediction)
      // P = P + Q (add process noise)
      P = P + processNoise

      // Measurement
      const z = pricesA[i].close // Measurement is stock A price
      const H = pricesB[i].close // Measurement model (stock B price)

      // Update step
      const y = z - H * x // Innovation (measurement - prediction)
      const S = H * P * H + measurementNoise // Innovation covariance
      const K = (P * H) / S // Kalman gain

      x = x + K * y // Update state estimate
      P = (1 - K * H) * P // Update error covariance

      // Calculate alpha (intercept) using current hedge ratio
      // For simplicity, we'll use a rolling window to calculate alpha
      const windowStart = Math.max(0, i - 20)
      let sumA = 0,
        sumB = 0,
        count = 0

      for (let j = windowStart; j <= i; j++) {
        sumA += pricesA[j].close
        sumB += pricesB[j].close
        count++
      }

      const meanA = sumA / count
      const meanB = sumB / count
      const alpha = meanA - x * meanB

      hedgeRatios.push(x)
      alphas.push(alpha)
    }

    return { hedgeRatios, alphas }
  }

  // Replace the simplified ADF test with a more robust implementation
  const adfTest = (data) => {
    const n = data.length
    if (n < 20) return { statistic: 0, pValue: 1, isStationary: false }

    // Calculate differences
    const diff = []
    for (let i = 1; i < n; i++) {
      diff.push(data[i] - data[i - 1])
    }

    // Calculate lag
    const lag = []
    for (let i = 0; i < n - 1; i++) {
      lag.push(data[i])
    }

    // Add lagged differences for augmentation (p=1)
    const laggedDiff = []
    for (let i = 1; i < n - 1; i++) {
      laggedDiff.push(diff[i - 1])
    }

    // Prepare data for regression
    const y = diff.slice(1) // Remove first element to align with laggedDiff
    const X = [] // Design matrix

    for (let i = 0; i < y.length; i++) {
      X.push([1, lag[i + 1], laggedDiff[i]]) // Intercept, lag, lagged diff
    }

    // Perform OLS regression
    // X'X
    const XtX = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]

    for (let i = 0; i < X.length; i++) {
      for (let j = 0; j < 3; j++) {
        for (let k = 0; k < 3; k++) {
          XtX[j][k] += X[i][j] * X[i][k]
        }
      }
    }

    // X'y
    const Xty = [0, 0, 0]
    for (let i = 0; i < X.length; i++) {
      for (let j = 0; j < 3; j++) {
        Xty[j] += X[i][j] * y[i]
      }
    }

    // Invert X'X (simplified for 3x3)
    const det =
      XtX[0][0] * (XtX[1][1] * XtX[2][2] - XtX[1][2] * XtX[2][1]) -
      XtX[0][1] * (XtX[1][0] * XtX[2][2] - XtX[1][2] * XtX[2][0]) +
      XtX[0][2] * (XtX[1][0] * XtX[2][1] - XtX[1][1] * XtX[2][0])

    if (Math.abs(det) < 1e-10) {
      return { statistic: 0, pValue: 1, isStationary: false }
    }

    const invXtX = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]

    invXtX[0][0] = (XtX[1][1] * XtX[2][2] - XtX[1][2] * XtX[2][1]) / det
    invXtX[0][1] = (XtX[0][2] * XtX[2][1] - XtX[0][1] * XtX[2][2]) / det
    invXtX[0][2] = (XtX[0][1] * XtX[1][2] - XtX[0][2] * XtX[1][1]) / det
    invXtX[1][0] = (XtX[1][2] * XtX[2][0] - XtX[1][0] * XtX[2][2]) / det
    invXtX[1][1] = (XtX[0][0] * XtX[2][2] - XtX[0][2] * XtX[2][0]) / det
    invXtX[1][2] = (XtX[0][2] * XtX[1][0] - XtX[0][0] * XtX[1][2]) / det
    invXtX[2][0] = (XtX[1][0] * XtX[2][1] - XtX[1][1] * XtX[2][0]) / det
    invXtX[2][1] = (XtX[0][1] * XtX[2][0] - XtX[0][0] * XtX[2][1]) / det
    invXtX[2][2] = (XtX[0][0] * XtX[1][1] - XtX[0][1] * XtX[1][0]) / det

    // Calculate coefficients
    const beta = [0, 0, 0]
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        beta[i] += invXtX[i][j] * Xty[j]
      }
    }

    // Calculate residuals and residual sum of squares
    let rss = 0
    for (let i = 0; i < y.length; i++) {
      let yHat = 0
      for (let j = 0; j < 3; j++) {
        yHat += X[i][j] * beta[j]
      }
      rss += Math.pow(y[i] - yHat, 2)
    }

    // Calculate standard error of coefficient
    const sigma2 = rss / (y.length - 3)
    const se = [0, 0, 0]
    for (let i = 0; i < 3; i++) {
      se[i] = Math.sqrt(sigma2 * invXtX[i][i])
    }

    // Calculate t-statistic for the lagged level
    const tStatistic = beta[1] / se[1]

    // Critical values from MacKinnon (1991)
    const criticalValues = {
      "1%": -3.43,
      "5%": -2.86,
      "10%": -2.57,
    }

    // Approximate p-value using t-distribution
    // This is a simplification - in practice, use proper statistical tables
    const pValue = 2 * (1 - Math.abs(tStatistic) / Math.sqrt(y.length))

    return {
      statistic: tStatistic,
      pValue: pValue,
      criticalValues,
      isStationary: pValue < 0.05,
    }
  }

  const calculateCorrelation = (pricesA, pricesB) => {
    const n = pricesA.length
    let sumA = 0,
      sumB = 0,
      sumAB = 0,
      sumA2 = 0,
      sumB2 = 0

    for (let i = 0; i < n; i++) {
      sumA += pricesA[i].close
      sumB += pricesB[i].close
      sumAB += pricesA[i].close * pricesB[i].close
      sumA2 += pricesA[i].close * pricesA[i].close
      sumB2 += pricesB[i].close * pricesB[i].close
    }

    const numerator = n * sumAB - sumA * sumB
    const denominator = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB))

    return denominator === 0 ? 0 : numerator / denominator
  }

  // Add Half-Life calculation to measure mean reversion speed
  const calculateHalfLife = (spreads) => {
    const n = spreads.length
    if (n < 20) return { halfLife: 0, isValid: false }

    // Calculate differences and lags
    const y = []
    const x = []

    for (let i = 1; i < n; i++) {
      y.push(spreads[i] - spreads[i - 1])
      x.push(spreads[i - 1])
    }

    // Calculate regression
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0
    for (let i = 0; i < y.length; i++) {
      sumX += x[i]
      sumY += y[i]
      sumXY += x[i] * y[i]
      sumX2 += x[i] * x[i]
    }

    const beta = (y.length * sumXY - sumX * sumY) / (y.length * sumX2 - sumX * sumX)

    // Calculate half-life
    const halfLife = -Math.log(2) / beta

    return {
      halfLife: halfLife > 0 && halfLife < 252 ? halfLife : 0,
      isValid: halfLife > 0 && halfLife < 252,
    }
  }

  // New function to calculate practical trade half-life
  const calculatePracticalTradeHalfLife = (zScores, entryThreshold = 2.0, exitThreshold = 0.5) => {
    const tradeCycles = []
    let inTrade = false
    let entryDay = 0
    let entryDirection = ""

    // Find all historical trade cycles
    for (let i = 0; i < zScores.length; i++) {
      // Entry condition
      if (!inTrade && Math.abs(zScores[i]) >= entryThreshold) {
        inTrade = true
        entryDay = i
        entryDirection = zScores[i] > 0 ? "positive" : "negative"
      }

      // Exit condition - reached target
      if (inTrade) {
        if (
          (entryDirection === "positive" && zScores[i] <= exitThreshold) ||
          (entryDirection === "negative" && zScores[i] >= -exitThreshold)
        ) {
          tradeCycles.push(i - entryDay) // Days to complete the trade
          inTrade = false
        }

        // Exit condition - max holding period reached (optional)
        if (i - entryDay > 100) {
          // Abandon analysis if trade takes too long
          inTrade = false
        }
      }
    }

    // Calculate statistics on trade cycles
    if (tradeCycles.length === 0)
      return {
        tradeCycleLength: 0,
        isValid: false,
        sampleSize: 0,
        successRate: 0,
        medianCycleLength: 0,
      }

    const avgCycleLength = tradeCycles.reduce((sum, val) => sum + val, 0) / tradeCycles.length
    const successRate = tradeCycles.length / (tradeCycles.length + (inTrade ? 1 : 0)) // Account for incomplete trades

    // Sort for median calculation
    const sortedCycles = [...tradeCycles].sort((a, b) => a - b)
    const medianCycleLength = sortedCycles[Math.floor(sortedCycles.length / 2)]

    return {
      tradeCycleLength: avgCycleLength,
      medianCycleLength,
      successRate,
      sampleSize: tradeCycles.length,
      isValid: tradeCycles.length >= 5 && successRate > 0.7, // Minimum sample size and success rate
    }
  }

  // Add Hurst Exponent calculation to measure persistence vs mean-reversion
  const calculateHurstExponent = (data) => {
    const n = data.length
    if (n < 100) return 0.5 // Default to random walk for small samples

    const maxLag = Math.min(100, Math.floor(n / 2))
    const lags = []
    const rs = []

    for (let lag = 10; lag <= maxLag; lag += 10) {
      const rsValues = []

      // Calculate R/S for multiple windows
      for (let i = 0; i < n - lag; i += lag) {
        const series = data.slice(i, i + lag)
        const mean = series.reduce((sum, val) => sum + val, 0) / lag

        // Calculate cumulative deviations
        const cumDevs = []
        let sum = 0
        for (let j = 0; j < series.length; j++) {
          sum += series[j] - mean
          cumDevs.push(sum)
        }

        // Calculate range
        const range = Math.max(...cumDevs) - Math.min(...cumDevs)

        // Calculate standard deviation
        const stdDev = Math.sqrt(series.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / lag)

        if (stdDev > 0) {
          rsValues.push(range / stdDev)
        }
      }

      if (rsValues.length > 0) {
        lags.push(Math.log(lag))
        rs.push(Math.log(rsValues.reduce((sum, val) => sum + val, 0) / rsValues.length))
      }
    }

    // Linear regression to estimate Hurst exponent
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0
    for (let i = 0; i < lags.length; i++) {
      sumX += lags[i]
      sumY += rs[i]
      sumXY += lags[i] * rs[i]
      sumX2 += lags[i] * lags[i]
    }

    const hurstExponent = (lags.length * sumXY - sumX * sumY) / (lags.length * sumX2 - sumX * sumX)

    return hurstExponent
  }

  // Define a local z-score calculation function to avoid import issues
  const calculateZScore = (data) => {
    if (!data || data.length === 0) return 0

    const mean = data.reduce((sum, val) => sum + val, 0) / data.length
    const stdDev = Math.sqrt(data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length)

    // Return the z-score of the last element
    return stdDev === 0 ? 0 : (data[data.length - 1] - mean) / stdDev
  }

  const runRatioAnalysis = async () => {
    if (!selectedPair.stockA || !selectedPair.stockB) {
      setError("Please select both stocks for analysis.")
      return
    }

    if (!fromDate || !toDate) {
      setError("Please select a date range for analysis.")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const db = await openDB("StockDatabase", 2)
      const tx = db.transaction("stocks", "readonly")
      const store = tx.objectStore("stocks")
      const stockAData = await store.get(selectedPair.stockA)
      const stockBData = await store.get(selectedPair.stockB)

      if (!stockAData || !stockBData) {
        setError("Stock data not found. Please make sure you've fetched the data for both stocks.")
        setIsLoading(false)
        return
      }

      const pricesA = filterByDate(stockAData.data)
      const pricesB = filterByDate(stockBData.data)

      if (pricesA.length < ratioLookbackWindow || pricesB.length < ratioLookbackWindow) {
        setError(`Not enough data points for the selected lookback window (${ratioLookbackWindow} days).`)
        setIsLoading(false)
        return
      }

      const minLength = Math.min(pricesA.length, pricesB.length)
      const dates = []
      const stockAPrices = []
      const stockBPrices = []
      const ratios = []

      // Calculate price ratios
      for (let i = 0; i < minLength; i++) {
        dates.push(pricesA[i].date)
        stockAPrices.push(pricesA[i].close)
        stockBPrices.push(pricesB[i].close)
        ratios.push(pricesA[i].close / pricesB[i].close)
      }

      // Calculate z-scores for ratios
      const zScores = []
      for (let i = 0; i < ratios.length; i++) {
        // Use the same lookback window as for ratio statistics
        const windowData = ratios.slice(Math.max(0, i - ratioLookbackWindow + 1), i + 1)
        zScores.push(calculateZScore(windowData))
      }

      // Calculate ratio statistics
      const meanRatio = ratios.reduce((sum, val) => sum + val, 0) / ratios.length
      const stdDevRatio = Math.sqrt(ratios.reduce((sum, val) => sum + Math.pow(val - meanRatio, 2), 0) / ratios.length)

      // Calculate min/max z-score - Filter out NaN values before calculating min/max
      const validZScores = zScores.filter((z) => !isNaN(z))
      const minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      const maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      // Calculate correlation
      const correlation = calculateCorrelation(pricesA.slice(0, minLength), pricesB.slice(0, minLength))

      // Run ADF test on ratios
      const adfResults = adfTest(ratios)

      // Calculate half-life and Hurst exponent
      const halfLifeResult = calculateHalfLife(ratios)
      const hurstExponent = calculateHurstExponent(ratios)

      // Calculate practical trade half-life
      const practicalTradeHalfLife = calculatePracticalTradeHalfLife(zScores, entryThreshold, exitThreshold)

      // Prepare table data for all days
      const tableData = []
      for (let i = 0; i < dates.length; i++) {
        tableData.push({
          date: dates[i],
          priceA: stockAPrices[i],
          priceB: stockBPrices[i],
          ratio: ratios[i],
          zScore: zScores[i],
        })
      }

      // Calculate rolling mean and standard deviation for ratio chart
      const rollingMean = []
      const rollingUpperBand1 = []
      const rollingLowerBand1 = []
      const rollingUpperBand2 = []
      const rollingLowerBand2 = []

      for (let i = 0; i < ratios.length; i++) {
        const windowStart = Math.max(0, i - ratioLookbackWindow + 1)
        const window = ratios.slice(windowStart, i + 1)
        const mean = window.reduce((sum, val) => sum + val, 0) / window.length
        const stdDev = Math.sqrt(window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / window.length)

        rollingMean.push(mean)
        rollingUpperBand1.push(mean + stdDev)
        rollingLowerBand1.push(mean - stdDev)
        rollingUpperBand2.push(mean + 2 * stdDev)
        rollingLowerBand2.push(mean - 2 * stdDev)
      }

      setAnalysisData({
        dates,
        ratios,
        zScores,
        stockAPrices,
        stockBPrices,
        statistics: {
          correlation,
          meanRatio,
          stdDevRatio,
          minZScore,
          maxZScore,
          adfResults,
          halfLife: halfLifeResult.halfLife,
          halfLifeValid: halfLifeResult.isValid,
          hurstExponent,
          practicalTradeHalfLife,
          modelType: "ratio",
        },
        tableData,
        chartData: {
          rollingMean,
          rollingUpperBand1,
          rollingLowerBand1,
          rollingUpperBand2,
          rollingLowerBand2,
        },
      })
    } catch (error) {
      console.error("Error in analysis:", error)
      setError("An error occurred during analysis. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const runOLSAnalysis = async () => {
    if (!selectedPair.stockA || !selectedPair.stockB) {
      setError("Please select both stocks for analysis.")
      return
    }

    if (!fromDate || !toDate) {
      setError("Please select a date range for analysis.")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const db =
