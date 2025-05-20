"use client"

import { useState, useEffect } from "react"
import { openDB } from "idb"
import calculateZScore from "../utils/calculations"
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
        zScores.push(calculateZScore(windowData).pop())
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

      // Prepare table data (last 30 days or less)
      // Prepare complete table data
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

      if (pricesA.length < olsLookbackWindow || pricesB.length < olsLookbackWindow) {
        setError(`Not enough data points for the selected lookback window (${olsLookbackWindow} days).`)
        setIsLoading(false)
        return
      }

      const minLength = Math.min(pricesA.length, pricesB.length)
      const hedgeRatios = []
      const spreads = []
      const dates = []
      const stockAPrices = []
      const stockBPrices = []
      const alphas = []

      // Calculate rolling hedge ratios and spreads using OLS
      for (let i = 0; i < minLength; i++) {
        const { beta, alpha } = calculateHedgeRatio(pricesA, pricesB, i, olsLookbackWindow)
        const spread = pricesA[i].close - (alpha + beta * pricesB[i].close)

        hedgeRatios.push(beta)
        alphas.push(alpha)
        spreads.push(spread)
        dates.push(pricesA[i].date)
        stockAPrices.push(pricesA[i].close)
        stockBPrices.push(pricesB[i].close)
      }

      // Calculate z-scores for spreads
      const zScores = []
      for (let i = 0; i < spreads.length; i++) {
        const windowData = spreads.slice(Math.max(0, i - zScoreLookback + 1), i + 1)
        zScores.push(calculateZScore(windowData).pop())
      }

      // Calculate spread statistics
      const meanSpread = spreads.reduce((sum, val) => sum + val, 0) / spreads.length
      const stdDevSpread = Math.sqrt(
        spreads.reduce((sum, val) => sum + Math.pow(val - meanSpread, 2), 0) / spreads.length,
      )

      // Calculate min/max z-score - Filter out NaN values before calculating min/max
      const validZScores = zScores.filter((z) => !isNaN(z))
      const minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      const maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      // Calculate correlation
      const correlation = calculateCorrelation(pricesA.slice(0, minLength), pricesB.slice(0, minLength))

      // Run ADF test on spreads
      const adfResults = adfTest(spreads)

      // Calculate half-life and Hurst exponent
      const halfLifeResult = calculateHalfLife(spreads)
      const hurstExponent = calculateHurstExponent(spreads)

      // Calculate practical trade half-life
      const practicalTradeHalfLife = calculatePracticalTradeHalfLife(zScores, entryThreshold, exitThreshold)

      // Prepare table data (last 30 days or less)
      // Prepare complete table data
      const tableData = []
      for (let i = 0; i < dates.length; i++) {
        tableData.push({
          date: dates[i],
          priceA: stockAPrices[i],
          priceB: stockBPrices[i],
          alpha: alphas[i],
          hedgeRatio: hedgeRatios[i],
          spread: spreads[i],
          zScore: zScores[i],
        })
      }

      // Calculate rolling mean and standard deviation for spread chart
      const rollingMean = []
      const rollingUpperBand1 = []
      const rollingLowerBand1 = []
      const rollingUpperBand2 = []
      const rollingLowerBand2 = []

      for (let i = 0; i < spreads.length; i++) {
        const windowStart = Math.max(0, i - olsLookbackWindow + 1)
        const window = spreads.slice(windowStart, i + 1)
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
        hedgeRatios,
        alphas,
        spreads,
        zScores,
        stockAPrices,
        stockBPrices,
        statistics: {
          correlation,
          meanSpread,
          stdDevSpread,
          minZScore,
          maxZScore,
          adfResults,
          halfLife: halfLifeResult.halfLife,
          halfLifeValid: halfLifeResult.isValid,
          hurstExponent,
          practicalTradeHalfLife,
          modelType: "ols",
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

  const runKalmanAnalysis = async () => {
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

      if (pricesA.length < kalmanLookbackWindow || pricesB.length < kalmanLookbackWindow) {
        setError(`Not enough data points for the selected lookback window (${kalmanLookbackWindow} days).`)
        setIsLoading(false)
        return
      }

      const minLength = Math.min(pricesA.length, pricesB.length)
      const dates = []
      const stockAPrices = []
      const stockBPrices = []

      // Prepare price data
      for (let i = 0; i < minLength; i++) {
        dates.push(pricesA[i].date)
        stockAPrices.push(pricesA[i].close)
        stockBPrices.push(pricesB[i].close)
      }

      // Apply Kalman filter to estimate hedge ratios
      const { hedgeRatios, alphas } = kalmanFilter(
        pricesA.slice(0, minLength),
        pricesB.slice(0, minLength),
        kalmanProcessNoise,
        kalmanMeasurementNoise,
      )

      // Calculate spreads using Kalman filter hedge ratios
      const spreads = []
      for (let i = 0; i < minLength; i++) {
        const spread = stockAPrices[i] - (alphas[i] + hedgeRatios[i] * stockBPrices[i])
        spreads.push(spread)
      }

      // Calculate z-scores for spreads
      const zScores = []
      for (let i = 0; i < spreads.length; i++) {
        const windowData = spreads.slice(Math.max(0, i - zScoreLookback + 1), i + 1)
        zScores.push(calculateZScore(windowData).pop())
      }

      // Calculate spread statistics
      const meanSpread = spreads.reduce((sum, val) => sum + val, 0) / spreads.length
      const stdDevSpread = Math.sqrt(
        spreads.reduce((sum, val) => sum + Math.pow(val - meanSpread, 2), 0) / spreads.length,
      )

      // Calculate min/max z-score - Filter out NaN values before calculating min/max
      const validZScores = zScores.filter((z) => !isNaN(z))
      const minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      const maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      // Calculate correlation
      const correlation = calculateCorrelation(pricesA.slice(0, minLength), pricesB.slice(0, minLength))

      // Run ADF test on spreads
      const adfResults = adfTest(spreads)

      // Calculate half-life and Hurst exponent
      const halfLifeResult = calculateHalfLife(spreads)
      const hurstExponent = calculateHurstExponent(spreads)

      // Calculate practical trade half-life
      const practicalTradeHalfLife = calculatePracticalTradeHalfLife(zScores, entryThreshold, exitThreshold)

      // Prepare table data (last 30 days or less)
      // Prepare complete table data
      const tableData = []
      for (let i = 0; i < dates.length; i++) {
        tableData.push({
          date: dates[i],
          priceA: stockAPrices[i],
          priceB: stockBPrices[i],
          alpha: alphas[i],
          hedgeRatio: hedgeRatios[i],
          spread: spreads[i],
          zScore: zScores[i],
        })
      }

      // Calculate rolling mean and standard deviation for spread chart
      const rollingMean = []
      const rollingUpperBand1 = []
      const rollingLowerBand1 = []
      const rollingUpperBand2 = []
      const rollingLowerBand2 = []

      for (let i = 0; i < spreads.length; i++) {
        const windowStart = Math.max(0, i - kalmanLookbackWindow + 1)
        const window = spreads.slice(windowStart, i + 1)
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
        hedgeRatios,
        alphas,
        spreads,
        zScores,
        stockAPrices,
        stockBPrices,
        statistics: {
          correlation,
          meanSpread,
          stdDevSpread,
          minZScore,
          maxZScore,
          adfResults,
          halfLife: halfLifeResult.halfLife,
          halfLifeValid: halfLifeResult.isValid,
          hurstExponent,
          practicalTradeHalfLife,
          modelType: "kalman",
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

  const runAnalysis = () => {
    if (activeTab === "ratio") {
      runRatioAnalysis()
    } else if (activeTab === "ols") {
      runOLSAnalysis()
    } else if (activeTab === "kalman") {
      runKalmanAnalysis()
    }
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-bold text-white">Pair Analyzer</h1>
        <p className="text-xl text-gray-300">
          Analyze the statistical relationship between two stocks for pair trading
        </p>
      </div>

      <div className="card">
        <h2 className="text-2xl font-bold text-white mb-6">Analysis Parameters</h2>

        {error && <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-md text-red-300">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div>
            <label className="block text-base font-medium text-gray-300 mb-2">Stock Selection</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Stock A</label>
                <select name="stockA" value={selectedPair.stockA} onChange={handleSelection} className="input-field">
                  <option value="">Select</option>
                  {stocks.map((symbol) => (
                    <option key={symbol} value={symbol}>
                      {symbol}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Stock B</label>
                <select name="stockB" value={selectedPair.stockB} onChange={handleSelection} className="input-field">
                  <option value="">Select</option>
                  {stocks.map((symbol) => (
                    <option key={symbol} value={symbol}>
                      {symbol}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-base font-medium text-gray-300 mb-2">Date Range</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">To Date</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input-field" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs for different models */}
        <div className="mb-6">
          <div className="flex border-b border-navy-700">
            <button
              onClick={() => setActiveTab("ratio")}
              className={`px-4 py-2 font-medium ${
                activeTab === "ratio" ? "text-gold-400 border-b-2 border-gold-400" : "text-gray-300 hover:text-white"
              }`}
            >
              Ratio Model
            </button>
            <button
              onClick={() => setActiveTab("ols")}
              className={`px-4 py-2 font-medium ${
                activeTab === "ols" ? "text-gold-400 border-b-2 border-gold-400" : "text-gray-300 hover:text-white"
              }`}
            >
              OLS Spread Model
            </button>
            <button
              onClick={() => setActiveTab("kalman")}
              className={`px-4 py-2 font-medium ${
                activeTab === "kalman" ? "text-gold-400 border-b-2 border-gold-400" : "text-gray-300 hover:text-white"
              }`}
            >
              Kalman Spread Model
            </button>
          </div>
        </div>

        {/* Model-specific parameters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {activeTab === "ratio" ? (
            <div>
              <label className="block text-base font-medium text-gray-300 mb-2">Ratio Lookback Window (Days)</label>
              <input
                type="number"
                value={ratioLookbackWindow}
                onChange={(e) => setRatioLookbackWindow(Number.parseInt(e.target.value))}
                min="10"
                max="252"
                className="input-field"
              />
              <p className="mt-1 text-sm text-gray-400">Window size for calculating ratio statistics and z-score</p>
            </div>
          ) : activeTab === "ols" ? (
            <>
              <div>
                <label className="block text-base font-medium text-gray-300 mb-2">OLS Lookback Window (Days)</label>
                <input
                  type="number"
                  value={olsLookbackWindow}
                  onChange={(e) => setOlsLookbackWindow(Number.parseInt(e.target.value))}
                  min="10"
                  max="252"
                  className="input-field"
                />
                <p className="mt-1 text-sm text-gray-400">Window size for rolling OLS regression</p>
              </div>
              <div>
                <label className="block text-base font-medium text-gray-300 mb-2">Z-Score Lookback (Days)</label>
                <input
                  type="number"
                  value={zScoreLookback}
                  onChange={(e) => setZScoreLookback(Number.parseInt(e.target.value))}
                  min="5"
                  max="100"
                  className="input-field"
                />
                <p className="mt-1 text-sm text-gray-400">Window size for z-score calculation</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-base font-medium text-gray-300 mb-2">Kalman Lookback Window (Days)</label>
                <input
                  type="number"
                  value={kalmanLookbackWindow}
                  onChange={(e) => setKalmanLookbackWindow(Number.parseInt(e.target.value))}
                  min="10"
                  max="252"
                  className="input-field"
                />
                <p className="mt-1 text-sm text-gray-400">Window size for rolling statistics</p>
              </div>
              <div>
                <label className="block text-base font-medium text-gray-300 mb-2">Z-Score Lookback (Days)</label>
                <input
                  type="number"
                  value={zScoreLookback}
                  onChange={(e) => setZScoreLookback(Number.parseInt(e.target.value))}
                  min="5"
                  max="100"
                  className="input-field"
                />
                <p className="mt-1 text-sm text-gray-400">Window size for z-score calculation</p>
              </div>
              <div>
                <label className="block text-base font-medium text-gray-300 mb-2">Kalman Filter Parameters</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Process Noise</label>
                    <input
                      type="number"
                      value={kalmanProcessNoise}
                      onChange={(e) => setKalmanProcessNoise(Number.parseFloat(e.target.value))}
                      min="0.001"
                      max="1"
                      step="0.001"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Measurement Noise</label>
                    <input
                      type="number"
                      value={kalmanMeasurementNoise}
                      onChange={(e) => setKalmanMeasurementNoise(Number.parseFloat(e.target.value))}
                      min="0.001"
                      max="1"
                      step="0.001"
                      className="input-field"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-base font-medium text-gray-300 mb-2">Plot Type</label>
            <select value={plotType} onChange={(e) => setPlotType(e.target.value)} className="input-field">
              <option value="line">Line Chart</option>
              <option value="scatter">Scatter Plot</option>
              <option value="histogram">Histogram</option>
            </select>
            <p className="mt-1 text-sm text-gray-400">Type of visualization</p>
          </div>
        </div>

        {/* Trade parameters section */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-white mb-4">Trade Parameters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-base font-medium text-gray-300 mb-2">Entry Z-Score Threshold</label>
              <input
                type="number"
                value={entryThreshold}
                onChange={(e) => setEntryThreshold(Number.parseFloat(e.target.value))}
                min="1"
                max="4"
                step="0.1"
                className="input-field"
              />
              <p className="mt-1 text-sm text-gray-400">Z-score threshold for trade entry (absolute value)</p>
            </div>
            <div>
              <label className="block text-base font-medium text-gray-300 mb-2">Exit Z-Score Threshold</label>
              <input
                type="number"
                value={exitThreshold}
                onChange={(e) => setExitThreshold(Number.parseFloat(e.target.value))}
                min="0"
                max="2"
                step="0.1"
                className="input-field"
              />
              <p className="mt-1 text-sm text-gray-400">Z-score threshold for trade exit (absolute value)</p>
            </div>
          </div>
        </div>

        <div className="flex justify-center mt-8">
          <button onClick={runAnalysis} disabled={isLoading} className="btn-primary">
            {isLoading ? (
              <span className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-2 h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Analyzing...
              </span>
            ) : (
              "Run Analysis"
            )}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center my-12">
          <svg
            className="animate-spin h-12 w-12 text-gold-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        </div>
      )}

      {analysisData && !isLoading && (
        <>
          <div className="card">
            <h2 className="text-2xl font-bold text-white mb-6">Analysis Results</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700">
                <h3 className="text-xl font-semibold text-white mb-4">Descriptive Statistics</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Correlation:</span>
                    <span className="text-gold-400 font-medium">{analysisData.statistics.correlation.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">
                      Mean {analysisData.statistics.modelType === "ratio" ? "Ratio" : "Spread"}:
                    </span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.modelType === "ratio"
                        ? analysisData.statistics.meanRatio.toFixed(4)
                        : analysisData.statistics.meanSpread.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">
                      Std Dev {analysisData.statistics.modelType === "ratio" ? "Ratio" : "Spread"}:
                    </span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.modelType === "ratio"
                        ? analysisData.statistics.stdDevRatio.toFixed(4)
                        : analysisData.statistics.stdDevSpread.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Min Z-score:</span>
                    <span className="text-gold-400 font-medium">{analysisData.statistics.minZScore.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Max Z-score:</span>
                    <span className="text-gold-400 font-medium">{analysisData.statistics.maxZScore.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Statistical Half-Life (days):</span>
                    <span
                      className={`font-medium ${analysisData.statistics.halfLifeValid ? "text-gold-400" : "text-red-400"}`}
                    >
                      {analysisData.statistics.halfLifeValid ? analysisData.statistics.halfLife.toFixed(2) : "Invalid"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Practical Trade Cycle (days):</span>
                    <span
                      className={`font-medium ${
                        analysisData.statistics.practicalTradeHalfLife.isValid ? "text-gold-400" : "text-red-400"
                      }`}
                    >
                      {analysisData.statistics.practicalTradeHalfLife.isValid
                        ? `${analysisData.statistics.practicalTradeHalfLife.tradeCycleLength.toFixed(1)} (${(
                            analysisData.statistics.practicalTradeHalfLife.successRate * 100
                          ).toFixed(0)}% success)`
                        : "Insufficient data"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Hurst Exponent:</span>
                    <span
                      className={`font-medium ${
                        analysisData.statistics.hurstExponent < 0.5
                          ? "text-green-400"
                          : analysisData.statistics.hurstExponent > 0.5
                            ? "text-red-400"
                            : "text-gold-400"
                      }`}
                    >
                      {analysisData.statistics.hurstExponent.toFixed(4)}
                      {analysisData.statistics.hurstExponent < 0.5
                        ? " (Mean-reverting)"
                        : analysisData.statistics.hurstExponent > 0.5
                          ? " (Trending)"
                          : " (Random)"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700">
                <h3 className="text-xl font-semibold text-white mb-4">ADF Test Results</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Test Statistic:</span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.adfResults.statistic.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">p-value:</span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.adfResults.pValue.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Critical Value (1%):</span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.adfResults.criticalValues["1%"]}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Critical Value (5%):</span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.adfResults.criticalValues["5%"]}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Stationarity:</span>
                    <span
                      className={`font-medium ${
                        analysisData.statistics.adfResults.isStationary ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {analysisData.statistics.adfResults.isStationary ? "Yes ✅" : "No ❌"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700 mb-8">
              <h3 className="text-xl font-semibold text-white mb-4">Pair Trading Recommendations</h3>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-navy-900/50 p-4 rounded-md border border-navy-700">
                    <h4 className="text-lg font-medium text-white mb-2">Pair Suitability</h4>
                    <div className="flex items-center">
                      <div
                        className={`w-3 h-3 rounded-full mr-2 ${
                          analysisData.statistics.correlation > 0.7 &&
                          analysisData.statistics.adfResults.isStationary &&
                          analysisData.statistics.halfLifeValid &&
                          analysisData.statistics.halfLife > 5 &&
                          analysisData.statistics.halfLife < 60 &&
                          analysisData.statistics.hurstExponent < 0.5
                            ? "bg-green-500"
                            : analysisData.statistics.correlation > 0.5 &&
                                analysisData.statistics.adfResults.isStationary
                              ? "bg-yellow-500"
                              : "bg-red-500"
                        }`}
                      ></div>
                      <span className="text-gray-300">
                        {analysisData.statistics.correlation > 0.7 &&
                        analysisData.statistics.adfResults.isStationary &&
                        analysisData.statistics.halfLifeValid &&
                        analysisData.statistics.halfLife > 5 &&
                        analysisData.statistics.halfLife < 60 &&
                        analysisData.statistics.hurstExponent < 0.5
                          ? "Excellent pair trading candidate"
                          : analysisData.statistics.correlation > 0.5 && analysisData.statistics.adfResults.isStationary
                            ? "Acceptable pair trading candidate"
                            : "Poor pair trading candidate"}
                      </span>
                    </div>
                  </div>

                  <div className="bg-navy-900/50 p-4 rounded-md border border-navy-700">
                    <h4 className="text-lg font-medium text-white mb-2">Current Signal</h4>
                    <div className="flex items-center">
                      {analysisData.zScores.length > 0 && (
                        <>
                          <div
                            className={`w-3 h-3 rounded-full mr-2 ${
                              analysisData.zScores[analysisData.zScores.length - 1] > 2
                                ? "bg-red-500"
                                : analysisData.zScores[analysisData.zScores.length - 1] < -2
                                  ? "bg-green-500"
                                  : "bg-gray-500"
                            }`}
                          ></div>
                          <span className="text-gray-300">
                            {analysisData.zScores[analysisData.zScores.length - 1] > 2
                              ? `Short ${selectedPair.stockA}, Long ${selectedPair.stockB} (Z-score: ${analysisData.zScores[analysisData.zScores.length - 1].toFixed(2)})`
                              : analysisData.zScores[analysisData.zScores.length - 1] < -2
                                ? `Long ${selectedPair.stockA}, Short ${selectedPair.stockB} (Z-score: ${analysisData.zScores[analysisData.zScores.length - 1].toFixed(2)})`
                                : "No trading signal (Z-score within normal range)"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-navy-900/50 p-4 rounded-md border border-navy-700">
                  <h4 className="text-lg font-medium text-white mb-2">Suggested Parameters</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <span className="text-gray-400 text-sm">Entry Z-score:</span>
                      <p className="text-white font-medium">
                        ±
                        {analysisData.statistics.modelType === "ratio"
                          ? analysisData.statistics.stdDevRatio > 0
                            ? "2.0"
                            : "N/A"
                          : analysisData.statistics.stdDevSpread > 0
                            ? "2.0"
                            : "N/A"}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">Exit Z-score:</span>
                      <p className="text-white font-medium">
                        ±
                        {analysisData.statistics.modelType === "ratio"
                          ? analysisData.statistics.stdDevRatio > 0
                            ? "0.5"
                            : "N/A"
                          : analysisData.statistics.stdDevSpread > 0
                            ? "0.5"
                            : "N/A"}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">Stop Loss Z-score:</span>
                      <p className="text-white font-medium">
                        ±
                        {analysisData.statistics.modelType === "ratio"
                          ? analysisData.statistics.stdDevRatio > 0
                            ? "3.0"
                            : "N/A"
                          : analysisData.statistics.stdDevSpread > 0
                            ? "3.0"
                            : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-navy-900/50 p-4 rounded-md border border-navy-700">
                  <h4 className="text-lg font-medium text-white mb-2">Position Sizing</h4>
                  <p className="text-gray-300 mb-2">For a market-neutral position with $10,000 total investment:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-gray-400 text-sm">{selectedPair.stockA} Position:</span>
                      <p className="text-white font-medium">
                        {analysisData.stockAPrices.length > 0
                          ? `${(5000).toFixed(2)} (${(5000 / analysisData.stockAPrices[analysisData.stockAPrices.length - 1]).toFixed(0)} shares)`
                          : "N/A"}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">{selectedPair.stockB} Position:</span>
                      <p className="text-white font-medium">
                        {analysisData.stockBPrices.length > 0 &&
                        (analysisData.hedgeRatios ? analysisData.hedgeRatios.length > 0 : analysisData.ratios)
                          ? `${(5000).toFixed(2)} (${(
                              (5000 / analysisData.stockBPrices[analysisData.stockBPrices.length - 1]) *
                                (analysisData.hedgeRatios
                                  ? analysisData.hedgeRatios[analysisData.hedgeRatios.length - 1]
                                  : analysisData.stockAPrices[analysisData.stockAPrices.length - 1] /
                                    analysisData.stockBPrices[analysisData.stockBPrices.length - 1])
                            ).toFixed(0)} shares)`
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {analysisData.statistics.modelType !== "ratio" && (
                <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700">
                  <h3 className="text-xl font-semibold text-white mb-4">Rolling Hedge Ratio Plot</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={analysisData.dates.map((date, i) => ({
                          date,
                          hedgeRatio: analysisData.hedgeRatios[i],
                        }))}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#dce5f3" }}
                          tickFormatter={(tick) => new Date(tick).toLocaleDateString()}
                          interval={Math.ceil(analysisData.dates.length / 10)}
                        />
                        <YAxis tick={{ fill: "#dce5f3" }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                          formatter={(value) => [value.toFixed(4), "Hedge Ratio (β)"]}
                          labelFormatter={(label) => new Date(label).toLocaleDateString()}
                        />
                        <Line type="monotone" dataKey="hedgeRatio" stroke="#ffd700" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-4 text-sm text-gray-400">
                    This chart shows how the hedge ratio (β) between {selectedPair.stockA} and {selectedPair.stockB}{" "}
                    evolves over time. A stable hedge ratio indicates a consistent relationship between the stocks.
                  </p>
                </div>
              )}

              <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700">
                <h3 className="text-xl font-semibold text-white mb-4">
                  {analysisData.statistics.modelType === "ratio" ? "Ratio Chart" : "Spread Chart"}
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={analysisData.dates.map((date, i) => ({
                        date,
                        value:
                          analysisData.statistics.modelType === "ratio"
                            ? analysisData.ratios[i]
                            : analysisData.spreads[i],
                        mean: analysisData.chartData.rollingMean[i],
                        upperBand1: analysisData.chartData.rollingUpperBand1[i],
                        lowerBand1: analysisData.chartData.rollingLowerBand1[i],
                        upperBand2: analysisData.chartData.rollingUpperBand2[i],
                        lowerBand2: analysisData.chartData.rollingLowerBand2[i],
                      }))}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "#dce5f3" }}
                        tickFormatter={(tick) => new Date(tick).toLocaleDateString()}
                        interval={Math.ceil(analysisData.dates.length / 10)}
                      />
                      <YAxis tick={{ fill: "#dce5f3" }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                        formatter={(value) => [value.toFixed(4), "Value"]}
                        labelFormatter={(label) => new Date(label).toLocaleDateString()}
                      />
                      <Line type="monotone" dataKey="value" stroke="#ffd700" dot={false} />
                      <Line type="monotone" dataKey="mean" stroke="#ffffff" dot={false} strokeDasharray="5 5" />
                      <Line type="monotone" dataKey="upperBand1" stroke="#3a4894" dot={false} strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="lowerBand1" stroke="#3a4894" dot={false} strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="upperBand2" stroke="#ff6b6b" dot={false} strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="lowerBand2" stroke="#ff6b6b" dot={false} strokeDasharray="3 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-4 text-sm text-gray-400">
                  This chart shows the {analysisData.statistics.modelType === "ratio" ? "ratio" : "spread"} between{" "}
                  {selectedPair.stockA} and {selectedPair.stockB} with rolling mean and standard deviation bands.
                  Mean-reverting behavior is ideal for pair trading.
                </p>
              </div>

              <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700">
                <h3 className="text-xl font-semibold text-white mb-4">Z-Score Chart</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={analysisData.dates.map((date, i) => ({
                        date,
                        zScore: analysisData.zScores[i],
                      }))}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "#dce5f3" }}
                        tickFormatter={(tick) => new Date(tick).toLocaleDateString()}
                        interval={Math.ceil(analysisData.dates.length / 10)}
                      />
                      <YAxis tick={{ fill: "#dce5f3" }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                        formatter={(value) => [value.toFixed(4), "Z-Score"]}
                        labelFormatter={(label) => new Date(label).toLocaleDateString()}
                      />
                      <ReferenceLine y={0} stroke="#ffffff" />
                      <ReferenceLine y={1} stroke="#3a4894" strokeDasharray="3 3" />
                      <ReferenceLine y={-1} stroke="#3a4894" strokeDasharray="3 3" />
                      <ReferenceLine y={2} stroke="#ff6b6b" strokeDasharray="3 3" />
                      <ReferenceLine y={-2} stroke="#ff6b6b" strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="zScore" stroke="#ffd700" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-4 text-sm text-gray-400">
                  This chart shows the z-score of the{" "}
                  {analysisData.statistics.modelType === "ratio" ? "ratio" : "spread"}, highlighting regions where
                  z-score {">"} 2 or {"<"} -2. These extreme values indicate potential trading opportunities.
                </p>
              </div>

              <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Scatter Plot: {selectedPair.stockA} vs {selectedPair.stockB}
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                      <XAxis
                        type="number"
                        dataKey="stockB"
                        name={selectedPair.stockB}
                        tick={{ fill: "#dce5f3" }}
                        label={{ value: selectedPair.stockB, position: "insideBottomRight", fill: "#dce5f3" }}
                      />
                      <YAxis
                        type="number"
                        dataKey="stockA"
                        name={selectedPair.stockA}
                        tick={{ fill: "#dce5f3" }}
                        label={{ value: selectedPair.stockA, angle: -90, position: "insideLeft", fill: "#dce5f3" }}
                      />
                      <ZAxis range={[15, 15]} />
                      <Tooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                        formatter={(value) => [value.toFixed(2), ""]}
                      />
                      <Scatter
                        name="Stock Prices"
                        data={analysisData.stockAPrices.map((priceA, i) => ({
                          stockA: priceA,
                          stockB: analysisData.stockBPrices[i],
                          date: analysisData.dates[i],
                        }))}
                        fill="#ffd700"
                      />
                      {/* Add regression line */}
                      {(() => {
                        if (analysisData.statistics.modelType !== "ratio" && analysisData.stockBPrices.length > 0) {
                          const lastBeta = analysisData.hedgeRatios[analysisData.hedgeRatios.length - 1]
                          const lastAlpha = analysisData.alphas[analysisData.alphas.length - 1]
                          const minB = Math.min(...analysisData.stockBPrices)
                          const maxB = Math.max(...analysisData.stockBPrices)

                          return (
                            <Line
                              type="linear"
                              dataKey="stockA"
                              data={[
                                { stockB: minB, stockA: lastAlpha + lastBeta * minB },
                                { stockB: maxB, stockA: lastAlpha + lastBeta * maxB },
                              ]}
                              stroke="#ff6b6b"
                              strokeWidth={2}
                              dot={false}
                              activeDot={false}
                              legendType="none"
                            />
                          )
                        }
                        return null
                      })()}
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-4 text-sm text-gray-400">
                  This scatter plot shows the relationship between {selectedPair.stockA} and {selectedPair.stockB}
                  {analysisData.statistics.modelType !== "ratio"
                    ? " with a regression line based on the latest regression."
                    : "."}
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-2xl font-bold text-white mb-6">
              Complete Data Table ({analysisData.tableData.length} Days)
            </h2>
            <div className="overflow-x-auto">
              <div className="max-h-[500px] overflow-y-auto">
                <table className="min-w-full divide-y divide-navy-700">
                  <thead className="bg-navy-800">
                    <tr>
                      <th className="table-header">Date</th>
                      <th className="table-header">{selectedPair.stockA} Price</th>
                      <th className="table-header">{selectedPair.stockB} Price</th>
                      {analysisData.statistics.modelType !== "ratio" && (
                        <>
                          <th className="table-header">Alpha (α)</th>
                          <th className="table-header">Hedge Ratio (β)</th>
                        </>
                      )}
                      <th className="table-header">
                        {analysisData.statistics.modelType === "ratio" ? "Ratio" : "Spread"}
                      </th>
                      <th className="table-header">Z-score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-800">
                    {analysisData.tableData.map((row, index) => (
                      <tr key={index} className={index % 2 === 0 ? "bg-navy-900/50" : "bg-navy-900/30"}>
                        <td className="table-cell">{row.date}</td>
                        <td className="table-cell">{row.priceA.toFixed(2)}</td>
                        <td className="table-cell">{row.priceB.toFixed(2)}</td>
                        {analysisData.statistics.modelType !== "ratio" && (
                          <>
                            <td className="table-cell">{row.alpha.toFixed(4)}</td>
                            <td className="table-cell">{row.hedgeRatio.toFixed(4)}</td>
                          </>
                        )}
                        <td className="table-cell">
                          {analysisData.statistics.modelType === "ratio" ? row.ratio.toFixed(4) : row.spread.toFixed(4)}
                        </td>
                        <td
                          className={`table-cell font-medium ${
                            row.zScore > 2 || row.zScore < -2
                              ? "text-gold-400"
                              : row.zScore > 1 || row.zScore < -1
                                ? "text-gold-400/70"
                                : "text-white"
                          }`}
                        >
                          {row.zScore.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
