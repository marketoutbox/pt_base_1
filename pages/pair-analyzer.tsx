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
  BarChart,
  Bar,
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
    return data
      .filter((entry) => entry.date >= fromDate && entry.date <= toDate)
      .sort((a, b) => new Date(a.date) - new Date(b.date)) // Sort by date in ascending order (oldest to newest)
  }

  // OLS regression for hedge ratio calculation with enhanced debugging
  const calculateHedgeRatio = (pricesA, pricesB, currentIndex, windowSize) => {
    const startIdx = Math.max(0, currentIndex - windowSize + 1)
    const endIdx = currentIndex + 1

    let sumA = 0,
      sumB = 0,
      sumAB = 0,
      sumB2 = 0
    let count = 0

    // Debug logging for the last calculation
    const isDebugDate = currentIndex === pricesA.length - 1 // Last date
    const windowDates = []
    const windowPricesA = []
    const windowPricesB = []

    // Enhanced data processing with type checking
    for (let i = startIdx; i < endIdx; i++) {
      // Ensure data is numeric - explicit conversion
      const priceA = typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
      const priceB = typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close

      // Validate numeric conversion
      if (isNaN(priceA) || isNaN(priceB)) {
        console.error(`Invalid price data at index ${i}: TCS=${pricesA[i].close}, HCL=${pricesB[i].close}`)
        continue
      }

      sumA += priceA
      sumB += priceB
      sumAB += priceA * priceB
      sumB2 += priceB * priceB
      count++

      if (isDebugDate) {
        windowDates.push(pricesA[i].date)
        windowPricesA.push(priceA)
        windowPricesB.push(priceB)

        // Log data types for first few entries
        if (i >= endIdx - 3) {
          console.log(`Data types - Day ${i}: TCS type=${typeof pricesA[i].close}, HCL type=${typeof pricesB[i].close}`)
          console.log(`Original values: TCS=${pricesA[i].close}, HCL=${pricesB[i].close}`)
          console.log(`Converted values: TCS=${priceA}, HCL=${priceB}`)
        }
      }
    }

    // Avoid division by zero
    if (count === 0 || count * sumB2 - sumB * sumB === 0) {
      console.warn("Division by zero or no valid data in OLS calculation")
      return { beta: 1, alpha: 0 }
    }

    // Calculate beta (slope) - Standard OLS formula
    const numerator = count * sumAB - sumA * sumB
    const denominator = count * sumB2 - sumB * sumB
    const beta = numerator / denominator

    // Calculate alpha (intercept)
    const meanA = sumA / count
    const meanB = sumB / count
    const alpha = meanA - beta * meanB

    if (isDebugDate) {
      console.log("=== ENHANCED OLS DEBUG INFO ===")
      console.log(`Window period: ${windowDates[0]} to ${windowDates[windowDates.length - 1]}`)
      console.log(`Window size: ${count} days (requested: ${windowSize})`)
      console.log(`Index range: ${startIdx} to ${endIdx - 1}`)
      console.log("")
      console.log("Raw sums:")
      console.log(`  sumA (TCS): ${sumA}`)
      console.log(`  sumB (HCL): ${sumB}`)
      console.log(`  sumAB: ${sumAB}`)
      console.log(`  sumB2: ${sumB2}`)
      console.log("")
      console.log("Means:")
      console.log(`  meanA (TCS): ${meanA}`)
      console.log(`  meanB (HCL): ${meanB}`)
      console.log("")
      console.log("OLS calculation:")
      console.log(`  numerator: ${count} * ${sumAB} - ${sumA} * ${sumB} = ${numerator}`)
      console.log(`  denominator: ${count} * ${sumB2} - ${sumB * sumB} = ${denominator}`)
      console.log(`  beta: ${numerator} / ${denominator} = ${beta}`)
      console.log(`  alpha: ${meanA} - ${beta} * ${meanB} = ${alpha}`)
      console.log("")
      console.log("Sample window data (last 5 days):")
      for (let i = Math.max(0, windowPricesA.length - 5); i < windowPricesA.length; i++) {
        console.log(`  ${windowDates[i]}: TCS=${windowPricesA[i]}, HCL=${windowPricesB[i]}`)
      }
      console.log("")

      // Manual verification for last 3 days
      if (windowPricesA.length >= 3) {
        const last3A = windowPricesA.slice(-3)
        const last3B = windowPricesB.slice(-3)
        const n = 3
        const manualSumA = last3A.reduce((sum, val) => sum + val, 0)
        const manualSumB = last3B.reduce((sum, val) => sum + val, 0)
        const manualSumAB = last3A.reduce((sum, val, i) => sum + val * last3B[i], 0)
        const manualSumB2 = last3B.reduce((sum, val) => sum + val * val, 0)

        const manualNumerator = n * manualSumAB - manualSumA * manualSumB
        const manualDenominator = n * manualSumB2 - sumB * sumB
        const manualBeta = manualNumerator / manualDenominator
        const manualAlpha = manualSumA / n - manualBeta * (manualSumB / n)

        console.log("Manual verification (last 3 days):")
        console.log(`  Data: TCS=[${last3A.join(", ")}], HCL=[${last3B.join(", ")}]`)
        console.log(`  Sums: A=${manualSumA}, B=${manualSumB}, AB=${manualSumAB}, B2=${manualSumB2}`)
        console.log(`  Beta: ${manualBeta}, Alpha: ${manualAlpha}`)
      }
      console.log("===============================")
    }

    return { beta, alpha }
  }

  // Add this function to help compare with ChatGPT implementation
  const compareWithChatGPT = (pricesA, pricesB, windowSize = 60) => {
    console.log("=== CHATGPT COMPARISON DATA ===")

    // Get last 60 days of data
    const endIdx = pricesA.length - 1
    const startIdx = Math.max(0, endIdx - windowSize + 1)

    console.log(`Comparison window: ${pricesA[startIdx].date} to ${pricesA[endIdx].date}`)
    console.log(`Window size: ${endIdx - startIdx + 1} days`)
    console.log(`Start index: ${startIdx}, End index: ${endIdx}`)

    // Extract just the prices and dates for easy copying
    const comparisonData = []
    const tcsValues = []
    const hclValues = []

    for (let i = startIdx; i <= endIdx; i++) {
      const tcs = typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
      const hcl = typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close

      comparisonData.push({
        date: pricesA[i].date,
        TCS: tcs,
        HCL: hcl,
      })
      tcsValues.push(tcs)
      hclValues.push(hcl)
    }

    console.log("Raw data for ChatGPT (copy this):")
    console.log("Date,TCS,HCL")
    comparisonData.forEach((row) => {
      console.log(`${row.date},${row.TCS},${row.HCL}`)
    })

    // Calculate means
    const meanTCS = tcsValues.reduce((sum, val) => sum + val, 0) / tcsValues.length
    const meanHCL = hclValues.reduce((sum, val) => sum + val, 0) / hclValues.length

    console.log(`\nOur calculated means:`)
    console.log(`Mean TCS: ${meanTCS}`)
    console.log(`Mean HCL: ${meanHCL}`)

    // Method 1: Our current implementation (computational formula)
    const { beta: beta1, alpha: alpha1 } = calculateHedgeRatio(pricesA, pricesB, endIdx, windowSize)

    // Method 2: Covariance/Variance method (like ChatGPT)
    let covariance = 0
    let varianceHCL = 0

    for (let i = 0; i < tcsValues.length; i++) {
      const tcsDeviation = tcsValues[i] - meanTCS
      const hclDeviation = hclValues[i] - meanHCL
      covariance += tcsDeviation * hclDeviation
      varianceHCL += hclDeviation * hclDeviation
    }

    covariance = covariance / (tcsValues.length - 1) // Sample covariance
    varianceHCL = varianceHCL / (tcsValues.length - 1) // Sample variance

    const beta2 = covariance / varianceHCL
    const alpha2 = meanTCS - beta2 * meanHCL

    console.log(`\nMethod 1 (Our computational formula):`)
    console.log(`Beta: ${beta1}`)
    console.log(`Alpha: ${alpha1}`)

    console.log(`\nMethod 2 (Covariance/Variance like ChatGPT):`)
    console.log(`Covariance: ${covariance}`)
    console.log(`Variance HCL: ${varianceHCL}`)
    console.log(`Beta: ${beta2}`)
    console.log(`Alpha: ${alpha2}`)

    // Method 3: Population covariance/variance (n instead of n-1)
    const covariancePop = (covariance * (tcsValues.length - 1)) / tcsValues.length
    const varianceHCLPop = (varianceHCL * (tcsValues.length - 1)) / tcsValues.length
    const beta3 = covariancePop / varianceHCLPop
    const alpha3 = meanTCS - beta3 * meanHCL

    console.log(`\nMethod 3 (Population covariance/variance):`)
    console.log(`Population Covariance: ${covariancePop}`)
    console.log(`Population Variance HCL: ${varianceHCLPop}`)
    console.log(`Beta: ${beta3}`)
    console.log(`Alpha: ${alpha3}`)

    // Verify our computational formula manually
    let sumTCS = 0,
      sumHCL = 0,
      sumTCSHCL = 0,
      sumHCL2 = 0
    const n = tcsValues.length

    for (let i = 0; i < n; i++) {
      sumTCS += tcsValues[i]
      sumHCL += hclValues[i]
      sumTCSHCL += tcsValues[i] * hclValues[i]
      sumHCL2 += hclValues[i] * hclValues[i]
    }

    const numerator = n * sumTCSHCL - sumTCS * sumHCL
    const denominator = n * sumHCL2 - sumHCL * sumHCL
    const beta4 = numerator / denominator
    const alpha4 = sumTCS / n - beta4 * (sumHCL / n)

    console.log(`\nMethod 4 (Manual verification of our formula):`)
    console.log(`n: ${n}`)
    console.log(`sumTCS: ${sumTCS}`)
    console.log(`sumHCL: ${sumHCL}`)
    console.log(`sumTCSHCL: ${sumTCSHCL}`)
    console.log(`sumHCL2: ${sumHCL2}`)
    console.log(`numerator: ${numerator}`)
    console.log(`denominator: ${denominator}`)
    console.log(`Beta: ${beta4}`)
    console.log(`Alpha: ${alpha4}`)

    // Calculate expected vs actual for last day
    const lastTCS = tcsValues[tcsValues.length - 1]
    const lastHCL = hclValues[hclValues.length - 1]
    const expectedTCS = alpha1 + beta1 * lastHCL
    const spread = lastTCS - expectedTCS

    console.log(`\nLast day (${pricesA[endIdx].date}):`)
    console.log(`Actual TCS: ${lastTCS}`)
    console.log(`Expected TCS: ${expectedTCS}`)
    console.log(`Spread: ${spread}`)

    console.log("\n=== COMPARISON SUMMARY ===")
    console.log(`ChatGPT Beta: 4.25, Our Beta: ${beta1}`)
    console.log(`ChatGPT Alpha: -3799.35, Our Alpha: ${alpha1}`)
    console.log(`ChatGPT Mean TCS: 4200.35, Our Mean TCS: ${meanTCS}`)
    console.log(`ChatGPT Mean HCL: 1879.93, Our Mean HCL: ${meanHCL}`)
    console.log("===============================")

    return { beta: beta1, alpha: alpha1, spread, data: comparisonData }
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
      halfLife: beta < 0 ? halfLife : 0, // Return actual value if beta is negative
      isValid: halfLife > 0 && halfLife < 252, // Still mark as valid only if within trading range
    }
  }

  // Add rolling half-life calculation
  const calculateRollingHalfLife = (data, windowSize) => {
    const result = []

    // Need at least windowSize + 1 data points to calculate half-life
    if (data.length < windowSize + 1) {
      return Array(data.length).fill(null)
    }

    // For each point where we have enough previous data
    for (let i = 0; i < data.length; i++) {
      if (i < windowSize - 1) {
        // Not enough data yet
        result.push(null)
        continue
      }

      // Get window of data
      const windowData = data.slice(Math.max(0, i - windowSize + 1), i + 1)

      // Calculate mean of window
      const mean = windowData.reduce((sum, val) => sum + val, 0) / windowData.length

      // Calculate differences and lags
      const y = []
      const x = []

      for (let j = 1; j < windowData.length; j++) {
        y.push(windowData[j] - windowData[j - 1])
        x.push(windowData[j - 1] - mean) // De-mean the data
      }

      // Calculate regression
      let sumX = 0,
        sumY = 0,
        sumXY = 0,
        sumX2 = 0
      for (let j = 0; j < y.length; j++) {
        sumX += x[j]
        sumY += y[j]
        sumXY += x[j] * y[j]
        sumX2 += x[j] * x[j]
      }

      // Avoid division by zero
      if (sumX2 === 0) {
        result.push(null)
        continue
      }

      const beta = (y.length * sumXY - sumX * sumY) / (y.length * sumX2 - sumX * sumX)

      // Calculate half-life
      const halfLife = beta < 0 ? -Math.log(2) / beta : null

      // Check if half-life is valid (just needs to be positive)
      if (halfLife !== null && halfLife > 0) {
        result.push(halfLife)
      } else {
        result.push(null)
      }
    }

    return result
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

      // Calculate rolling half-life values
      const rollingHalfLifes = calculateRollingHalfLife(ratios, ratioLookbackWindow)

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
      const tableData = []
      for (let i = 0; i < dates.length; i++) {
        tableData.push({
          date: dates[i],
          priceA: stockAPrices[i],
          priceB: stockBPrices[i],
          ratio: ratios[i],
          zScore: zScores[i],
          halfLife: rollingHalfLifes[i] !== null ? rollingHalfLifes[i].toFixed(2) : "N/A",
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

      // Add this right after the filterByDate calls in runOLSAnalysis
      console.log("=== DATA VALIDATION ===")
      console.log(`Filtered data length: TCS=${pricesA.length}, HCL=${pricesB.length}`)
      console.log("Sample data types and values:")
      for (let i = 0; i < Math.min(3, pricesA.length); i++) {
        console.log(
          `  Day ${i}: TCS=${pricesA[i].close} (${typeof pricesA[i].close}), HCL=${pricesB[i].close} (${typeof pricesB[i].close})`,
        )
      }
      console.log("Last few data points:")
      for (let i = Math.max(0, pricesA.length - 3); i < pricesA.length; i++) {
        console.log(
          `  Day ${i}: ${pricesA[i].date} - TCS=${pricesA[i].close} (${typeof pricesA[i].close}), HCL=${pricesB[i].close} (${typeof pricesB[i].close})`,
        )
      }
      console.log("=======================")

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

      // Add comparison data for ChatGPT
      if (minLength > 60) {
        compareWithChatGPT(pricesA, pricesB, 60)
      }

      // Replace the spread calculation loop in runOLSAnalysis with this enhanced version
      for (let i = 0; i < minLength; i++) {
        const { beta, alpha } = calculateHedgeRatio(pricesA, pricesB, i, olsLookbackWindow)

        // Ensure numeric values for spread calculation
        const currentPriceA =
          typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
        const currentPriceB =
          typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close

        const spread = currentPriceA - (alpha + beta * currentPriceB)

        hedgeRatios.push(beta)
        alphas.push(alpha)
        spreads.push(spread)
        dates.push(pricesA[i].date)
        stockAPrices.push(currentPriceA)
        stockBPrices.push(currentPriceB)

        // Debug the last calculation
        if (i === minLength - 1) {
          console.log("=== FINAL SPREAD CALCULATION ===")
          console.log(`Date: ${pricesA[i].date}`)
          console.log(`TCS price: ${currentPriceA}`)
          console.log(`HCL price: ${currentPriceB}`)
          console.log(`Alpha: ${alpha}`)
          console.log(`Beta: ${beta}`)
          console.log(`Expected TCS: ${alpha + beta * currentPriceB}`)
          console.log(`Actual TCS: ${currentPriceA}`)
          console.log(`Spread: ${spread}`)
          console.log("================================")
        }
      }

      // Calculate z-scores for spreads using Gemini's methodology
      const zScores = []
      for (let i = 0; i < minLength; i++) {
        const { beta, alpha } = calculateHedgeRatio(pricesA, pricesB, i, olsLookbackWindow)

        // Calculate current day's spread
        const currentPriceA =
          typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
        const currentPriceB =
          typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close
        const currentSpread = currentPriceA - (alpha + beta * currentPriceB)

        // Calculate window spreads using current alpha/beta for the entire window
        const windowStart = Math.max(0, i - olsLookbackWindow + 1)
        const windowSpreads = []

        for (let j = windowStart; j <= i; j++) {
          const windowPriceA =
            typeof pricesA[j].close === "string" ? Number.parseFloat(pricesA[j].close) : pricesA[j].close
          const windowPriceB =
            typeof pricesB[j].close === "string" ? Number.parseFloat(pricesB[j].close) : pricesB[j].close
          const windowSpread = windowPriceA - (alpha + beta * windowPriceB)
          windowSpreads.push(windowSpread)
        }

        // Calculate z-score using sample standard deviation
        if (windowSpreads.length > 1) {
          const meanSpread = windowSpreads.reduce((sum, val) => sum + val, 0) / windowSpreads.length
          const sampleStdDev = Math.sqrt(
            windowSpreads.reduce((sum, val) => sum + Math.pow(val - meanSpread, 2), 0) / (windowSpreads.length - 1),
          )

          if (sampleStdDev > 0) {
            const zScore = (currentSpread - meanSpread) / sampleStdDev
            zScores.push(zScore)
          } else {
            zScores.push(0)
          }
        } else {
          zScores.push(0)
        }
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
        rollingLowerBand2.push(mean - stdDev)
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
                      {analysisData.statistics.halfLife > 0
                        ? `${analysisData.statistics.halfLife.toFixed(2)}${!analysisData.statistics.halfLifeValid ? " (Too slow)" : ""}`
                        : "Invalid"}
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
                    {plotType === "line" ? (
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
                    ) : plotType === "scatter" ? (
                      <ScatterChart
                        data={analysisData.dates.map((date, i) => ({
                          date: i, // Use index for x-axis
                          value:
                            analysisData.statistics.modelType === "ratio"
                              ? analysisData.ratios[i]
                              : analysisData.spreads[i],
                        }))}
                        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                        <XAxis
                          type="number"
                          dataKey="date"
                          name="Time"
                          tick={{ fill: "#dce5f3" }}
                          label={{ value: "Time (Days)", position: "insideBottomRight", fill: "#dce5f3" }}
                        />
                        <YAxis
                          type="number"
                          dataKey="value"
                          name="Value"
                          tick={{ fill: "#dce5f3" }}
                          label={{
                            value: analysisData.statistics.modelType === "ratio" ? "Ratio" : "Spread",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#dce5f3",
                          }}
                        />
                        <ZAxis range={[15, 15]} />
                        <Tooltip
                          cursor={{ strokeDasharray: "3 3" }}
                          contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                          formatter={(value) => [
                            value.toFixed(4),
                            analysisData.statistics.modelType === "ratio" ? "Ratio" : "Spread",
                          ]}
                        />
                        <Scatter
                          name={analysisData.statistics.modelType === "ratio" ? "Ratio" : "Spread"}
                          data={analysisData.dates.map((date, i) => ({
                            date: i,
                            value:
                              analysisData.statistics.modelType === "ratio"
                                ? analysisData.ratios[i]
                                : analysisData.spreads[i],
                          }))}
                          fill="#ffd700"
                        />
                      </ScatterChart>
                    ) : (
                      // Histogram
                      (() => {
                        const data =
                          analysisData.statistics.modelType === "ratio" ? analysisData.ratios : analysisData.spreads
                        const min = Math.min(...data)
                        const max = Math.max(...data)
                        const binCount = 20
                        const binSize = (max - min) / binCount

                        const bins = Array(binCount)
                          .fill(0)
                          .map((_, i) => ({
                            range: `${(min + i * binSize).toFixed(3)}-${(min + (i + 1) * binSize).toFixed(3)}`,
                            count: 0,
                            midpoint: min + (i + 0.5) * binSize,
                          }))

                        data.forEach((value) => {
                          const binIndex = Math.min(Math.floor((value - min) / binSize), binCount - 1)
                          bins[binIndex].count++
                        })

                        return (
                          <BarChart data={bins} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                            <XAxis
                              dataKey="midpoint"
                              tick={{ fill: "#dce5f3", fontSize: 10 }}
                              tickFormatter={(value) => value.toFixed(2)}
                              interval={Math.floor(binCount / 5)}
                            />
                            <YAxis tick={{ fill: "#dce5f3" }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                              formatter={(value) => [value, "Frequency"]}
                              labelFormatter={(label) => `Range: ${label.toFixed(3)}`}
                            />
                            <Bar dataKey="count" fill="#ffd700" />
                          </BarChart>
                        )
                      })()
                    )}
                  </ResponsiveContainer>
                </div>
                <p className="mt-4 text-sm text-gray-400">
                  This chart shows the {analysisData.statistics.modelType === "ratio" ? "ratio" : "spread"} between{" "}
                  {selectedPair.stockA} and {selectedPair.stockB}
                  {plotType === "line"
                    ? " with rolling mean and standard deviation bands."
                    : plotType === "scatter"
                      ? " as a scatter plot over time."
                      : " distribution statistics."}
                  {plotType === "line" && " Mean-reverting behavior is ideal for pair trading."}
                </p>
              </div>

              {/* Chart 2: Z-Score Chart */}
              <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700">
                <h3 className="text-xl font-semibold text-white mb-4">Z-Score Chart</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    {plotType === "line" ? (
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
                    ) : plotType === "scatter" ? (
                      <ScatterChart
                        data={analysisData.dates.map((date, i) => ({
                          date: i,
                          zScore: analysisData.zScores[i],
                        }))}
                        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                        <XAxis
                          type="number"
                          dataKey="date"
                          name="Time"
                          tick={{ fill: "#dce5f3" }}
                          label={{ value: "Time (Days)", position: "insideBottomRight", fill: "#dce5f3" }}
                        />
                        <YAxis
                          type="number"
                          dataKey="zScore"
                          name="Z-Score"
                          tick={{ fill: "#dce5f3" }}
                          label={{ value: "Z-Score", angle: -90, position: "insideLeft", fill: "#dce5f3" }}
                        />
                        <ZAxis range={[15, 15]} />
                        <Tooltip
                          cursor={{ strokeDasharray: "3 3" }}
                          contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                          formatter={(value) => [value.toFixed(4), "Z-Score"]}
                        />
                        <ReferenceLine y={0} stroke="#ffffff" />
                        <ReferenceLine y={2} stroke="#ff6b6b" strokeDasharray="3 3" />
                        <ReferenceLine y={-2} stroke="#ff6b6b" strokeDasharray="3 3" />
                        <Scatter
                          name="Z-Score"
                          data={analysisData.dates.map((date, i) => ({
                            date: i,
                            zScore: analysisData.zScores[i],
                          }))}
                          fill="#ffd700"
                        />
                      </ScatterChart>
                    ) : (
                      // Histogram
                      (() => {
                        const data = analysisData.zScores.filter((z) => !isNaN(z))
                        const min = Math.min(...data)
                        const max = Math.max(...data)
                        const binCount = 20
                        const binSize = (max - min) / binCount

                        const bins = Array(binCount)
                          .fill(0)
                          .map((_, i) => ({
                            range: `${(min + i * binSize).toFixed(2)}-${(min + (i + 1) * binSize).toFixed(2)}`,
                            count: 0,
                            midpoint: min + (i + 0.5) * binSize,
                          }))

                        data.forEach((value) => {
                          const binIndex = Math.min(Math.floor((value - min) / binSize), binCount - 1)
                          bins[binIndex].count++
                        })

                        return (
                          <BarChart data={bins} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                            <XAxis
                              dataKey="midpoint"
                              tick={{ fill: "#dce5f3", fontSize: 10 }}
                              tickFormatter={(value) => value.toFixed(1)}
                              interval={Math.floor(binCount / 5)}
                            />
                            <YAxis tick={{ fill: "#dce5f3" }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                              formatter={(value) => [value, "Frequency"]}
                              labelFormatter={(label) => `Z-Score: ${label.toFixed(2)}`}
                            />
                            <ReferenceLine x={0} stroke="#ffffff" strokeDasharray="3 3" />
                            <ReferenceLine x={2} stroke="#ff6b6b" strokeDasharray="3 3" />
                            <ReferenceLine x={-2} stroke="#ff6b6b" strokeDasharray="3 3" />
                            <Bar dataKey="count" fill="#ffd700" />
                          </BarChart>
                        )
                      })()
                    )}
                  </ResponsiveContainer>
                </div>
                <p className="mt-4 text-sm text-gray-400">
                  This chart shows the z-score of the{" "}
                  {analysisData.statistics.modelType === "ratio" ? "ratio" : "spread"}
                  {plotType === "line"
                    ? ", highlighting regions where z-score > 2 or < -2. These extreme values indicate potential trading opportunities."
                    : plotType === "scatter"
                      ? " as a scatter plot over time, showing the distribution of z-scores."
                      : " distribution statistics, showing how often extreme values occur."}
                </p>
              </div>

              {/* Chart 3: Price Chart */}
              <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Price Chart: {selectedPair.stockA} vs {selectedPair.stockB}
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    {plotType === "line" ? (
                      <LineChart
                        data={analysisData.dates.map((date, i) => ({
                          date,
                          stockA: analysisData.stockAPrices[i],
                          stockB: analysisData.stockBPrices[i],
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
                        <YAxis yAxisId="left" tick={{ fill: "#dce5f3" }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fill: "#dce5f3" }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                          formatter={(value, name) => [value.toFixed(2), name]}
                          labelFormatter={(label) => new Date(label).toLocaleDateString()}
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="stockA"
                          stroke="#ffd700"
                          dot={false}
                          name={selectedPair.stockA}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="stockB"
                          stroke="#ff6b6b"
                          dot={false}
                          name={selectedPair.stockB}
                        />
                      </LineChart>
                    ) : plotType === "scatter" ? (
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
                        {/* Add regression line for OLS/Kalman models */}
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
                    ) : (
                      // Histogram
                      (() => {
                        const createBins = (data, binCount = 15) => {
                          const min = Math.min(...data)
                          const max = Math.max(...data)
                          const binSize = (max - min) / binCount

                          const bins = Array(binCount)
                            .fill(0)
                            .map((_, i) => ({
                              midpoint: min + (i + 0.5) * binSize,
                              count: 0,
                            }))

                          data.forEach((value) => {
                            const binIndex = Math.min(Math.floor((value - min) / binSize), binCount - 1)
                            bins[binIndex].count++
                          })

                          return bins
                        }

                        const binsA = createBins(analysisData.stockAPrices)
                        const binsB = createBins(analysisData.stockBPrices)

                        // Combine bins for side-by-side display
                        const combinedData = []
                        const maxLength = Math.max(binsA.length, binsB.length)

                        for (let i = 0; i < maxLength; i++) {
                          combinedData.push({
                            index: i,
                            [`${selectedPair.stockA}`]: binsA[i]?.count || 0,
                            [`${selectedPair.stockB}`]: binsB[i]?.count || 0,
                            priceA: binsA[i]?.midpoint || 0,
                            priceB: binsB[i]?.midpoint || 0,
                          })
                        }

                        return (
                          <BarChart data={combinedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                            <XAxis
                              dataKey="index"
                              tick={{ fill: "#dce5f3", fontSize: 10 }}
                              label={{ value: "Price Bins", position: "insideBottomRight", fill: "#dce5f3" }}
                            />
                            <YAxis tick={{ fill: "#dce5f3" }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                              formatter={(value, name) => [value, `${name} Frequency`]}
                              labelFormatter={(label) => `Bin ${label}`}
                            />
                            <Bar dataKey={selectedPair.stockA} fill="#ffd700" />
                            <Bar dataKey={selectedPair.stockB} fill="#ff6b6b" />
                          </BarChart>
                        )
                      })()
                    )}
                  </ResponsiveContainer>
                </div>
                <p className="mt-4 text-sm text-gray-400">
                  This chart shows{" "}
                  {plotType === "line"
                    ? "both stock prices over time with dual Y-axes"
                    : plotType === "scatter"
                      ? "the relationship between the two stock prices"
                      : "the price distribution statistics for both stocks"}
                  {analysisData.statistics.modelType !== "ratio" && plotType === "scatter"
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
                      <th className="table-header">Half-Life</th>
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
                        <td className="table-cell">
                          {row.halfLife !== "N/A" ? (
                            <span
                              className={`${
                                Number.parseFloat(row.halfLife) < 20
                                  ? "text-green-400"
                                  : Number.parseFloat(row.halfLife) > 252
                                    ? "text-red-400"
                                    : "text-gold-400"
                              }`}
                            >
                              {row.halfLife}
                            </span>
                          ) : (
                            <span className="text-gray-500">N/A</span>
                          )}
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
