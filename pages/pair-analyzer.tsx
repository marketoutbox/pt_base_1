"use client"

import { useState, useEffect } from "react"
import { openDB } from "idb"
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

// Matrix operations for 2x2 matrices
const matrixMultiply2x2 = (A: number[][], B: number[][]): number[][] => {
  return [
    [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
    [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
  ]
}

const matrixMultiply2x1 = (A: number[][], b: number[]): number[] => {
  return [A[0][0] * b[0] + A[0][1] * b[1], A[1][0] * b[0] + A[1][1] * b[1]]
}

const matrixMultiply1x2 = (a: number[], B: number[][]): number[] => {
  return [a[0] * B[0][0] + a[1] * B[1][0], a[0] * B[0][1] + a[1] * B[1][1]]
}

const matrixTranspose2x2 = (A: number[][]): number[][] => {
  return [
    [A[0][0], A[1][0]],
    [A[0][1], A[1][1]],
  ]
}

const matrixAdd2x2 = (A: number[][], B: number[][]): number[][] => {
  return [
    [A[0][0] + B[0][0], A[0][1] + B[0][1]],
    [A[1][0] + B[1][0], A[1][1] + B[1][1]],
  ]
}

const matrixSubtract2x2 = (A: number[][], B: number[][]): number[][] => {
  return [
    [A[0][0] - B[0][0], A[0][1] - B[0][1]],
    [A[1][0] - B[1][0], A[1][1] - B[1][1]],
  ]
}

const matrixInverse2x2 = (A: number[][]): number[][] => {
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
  if (Math.abs(det) < 1e-10) {
    // Return identity matrix if singular
    return [
      [1, 0],
      [0, 1],
    ]
  }
  return [
    [A[1][1] / det, -A[0][1] / det],
    [-A[1][0] / det, A[0][0] / det],
  ]
}

const scalarInverse = (x: number): number => {
  return Math.abs(x) < 1e-10 ? 1.0 : 1.0 / x
}

// Declare undeclared functions
const calculateCorrelation = (pricesA: any[], pricesB: any[]) => {
  // Basic implementation of correlation calculation
  if (pricesA.length !== pricesB.length) {
    return 0 // Or handle the error as you see fit
  }

  const n = pricesA.length
  const sumA = pricesA.reduce(
    (sum, price) => sum + (typeof price.close === "string" ? Number.parseFloat(price.close) : price.close),
    0,
  )
  const sumB = pricesB.reduce(
    (sum, price) => sum + (typeof price.close === "string" ? Number.parseFloat(price.close) : price.close),
    0,
  )
  const sumASq = pricesA.reduce(
    (sum, price) => sum + Math.pow(typeof price.close === "string" ? Number.parseFloat(price.close) : price.close, 2),
    0,
  )
  const sumBSq = pricesB.reduce(
    (sum, price) => sum + Math.pow(typeof price.close === "string" ? Number.parseFloat(price.close) : price.close, 2),
    0,
  )
  const sumAB = pricesA.reduce(
    (sum, priceA, i) =>
      sum +
      (typeof priceA.close === "string" ? Number.parseFloat(priceA.close) : priceA.close) *
        (typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close),
    0,
  )

  const numerator = n * sumAB - sumA * sumB
  const denominator = Math.sqrt((n * sumASq - Math.pow(sumA, 2)) * (n * sumBSq - Math.pow(sumB, 2)))

  return denominator === 0 ? 0 : numerator / denominator
}

const adfTest = (data: number[]) => {
  // Placeholder for ADF test implementation
  return {
    statistic: 0,
    pValue: 0.5,
    criticalValues: { "1%": -3.43, "5%": -2.86, "10%": -2.57 },
    isStationary: false,
  }
}

const calculateHalfLife = (data: number[]) => {
  // Placeholder for half-life calculation
  return { halfLife: 10, isValid: true }
}

const calculateHurstExponent = (data: number[]) => {
  // Placeholder for Hurst exponent calculation
  return 0.3
}

const calculatePracticalTradeHalfLife = (zScores: number[], entryThreshold: number, exitThreshold: number) => {
  // Placeholder for practical trade half-life calculation
  return { tradeCycleLength: 20, successRate: 0.6, isValid: true }
}

const calculateRollingHalfLife = (data: number[], windowSize: number) => {
  const halfLifes = []
  for (let i = 0; i < data.length; i++) {
    if (i < windowSize - 1) {
      halfLifes.push(null) // Not enough data for the window
    } else {
      const windowData = data.slice(i - windowSize + 1, i + 1)
      const halfLifeResult = calculateHalfLife(windowData) // Use your existing half-life calculation
      halfLifes.push(halfLifeResult.halfLife)
    }
  }
  return halfLifes
}

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
  const [kalmanProcessNoise, setKalmanProcessNoise] = useState(0.0001)
  const [kalmanMeasurementNoise, setKalmanMeasurementNoise] = useState(1.0)
  const [kalmanInitialLookback, setKalmanInitialLookback] = useState(60)
  const [euclideanLookbackWindow, setEuclideanLookbackWindow] = useState(60)

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

    console.log(`
Our calculated means:`)
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

    console.log(`
Method 1 (Our computational formula):`)
    console.log(`Beta: ${beta1}`)
    console.log(`Alpha: ${alpha1}`)

    console.log(`
Method 2 (Covariance/Variance like ChatGPT):`)
    console.log(`Covariance: ${covariance}`)
    console.log(`Variance HCL: ${varianceHCL}`)
    console.log(`Beta: ${beta2}`)
    console.log(`Alpha: ${alpha2}`)

    // Method 3: Population covariance/variance (n instead of n-1)
    const covariancePop = (covariance * (tcsValues.length - 1)) / tcsValues.length
    const varianceHCLPop = (varianceHCL * (tcsValues.length - 1)) / tcsValues.length
    const beta3 = covariancePop / varianceHCLPop
    const alpha3 = meanTCS - beta3 * meanHCL

    console.log(`
Method 3 (Population covariance/variance):`)
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

    console.log(`
Method 4 (Manual verification of our formula):`)
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

    console.log(`
Last day (${pricesA[endIdx].date}):`)
    console.log(`Actual TCS: ${lastTCS}`)
    console.log(`Expected TCS: ${expectedTCS}`)
    console.log(`Spread: ${spread}`)

    console.log("=== COMPARISON SUMMARY ===")
    console.log(`ChatGPT Beta: 4.25, Our Beta: ${beta1}`)
    console.log(`ChatGPT Alpha: -3799.35, Our Alpha: ${alpha1}`)
    console.log(`ChatGPT Mean TCS: 4200.35, Our Mean TCS: ${meanTCS}`)
    console.log(`ChatGPT Mean HCL: 1879.93, Our Mean HCL: ${meanHCL}`)
    console.log("===============================")

    return { beta: beta1, alpha: alpha1, spread, data: comparisonData }
  }

  // Improved Kalman filter implementation with 2D state vector
  const kalmanFilter = (
    pricesA: { close: number; date: string }[],
    pricesB: { close: number; date: string }[],
    processNoise = 0.0001,
    measurementNoise = 1.0,
    initialLookback = 60,
  ) => {
    const n = pricesA.length

    if (n < initialLookback) {
      console.warn(`Not enough data for Kalman filter initialization. Need ${initialLookback}, got ${n}`)
      return { hedgeRatios: Array(n).fill(1), alphas: Array(n).fill(0) }
    }

    // Initialize with OLS regression on first initialLookback days
    let sumA = 0,
      sumB = 0,
      sumAB = 0,
      sumB2 = 0
    for (let i = 0; i < initialLookback; i++) {
      const priceA = typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
      const priceB = typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close

      sumA += priceA
      sumB += priceB
      sumAB += priceA * priceB
      sumB2 += priceB * priceB
    }

    const meanA = sumA / initialLookback
    const meanB = sumB / initialLookback

    // Calculate initial beta and alpha using OLS
    const numerator = initialLookback * sumAB - sumA * sumB
    const denominator = initialLookback * sumB2 - sumB * sumB
    const initialBeta = Math.abs(denominator) > 1e-10 ? numerator / denominator : 1.0
    const initialAlpha = meanA - initialBeta * meanB

    // Calculate initial measurement noise from OLS residuals
    let residualSumSquares = 0
    for (let i = 0; i < initialLookback; i++) {
      const priceA = typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
      const priceB = typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close
      const predicted = initialAlpha + initialBeta * priceB
      const residual = priceA - predicted
      residualSumSquares += residual * residual
    }
    const adaptiveR = residualSumSquares / (initialLookback - 2) // Use adaptive measurement noise

    console.log("=== IMPROVED KALMAN FILTER INITIALIZATION ===")
    console.log(`Initial lookback: ${initialLookback} days`)
    console.log(`Initial Alpha: ${initialAlpha.toFixed(4)}`)
    console.log(`Initial Beta: ${initialBeta.toFixed(4)}`)
    console.log(`Adaptive R (measurement noise): ${adaptiveR.toFixed(6)}`)
    console.log(`Process noise: ${processNoise}`)

    // Initialize state vector [alpha, beta]
    let x = [initialAlpha, initialBeta]

    // Initialize covariance matrix P
    let P: number[][] = [
      [1000, 0],
      [0, 1000],
    ]

    // Process noise matrix Q
    const Q: number[][] = [
      [processNoise, 0],
      [0, processNoise],
    ]

    // State transition matrix F (identity for this model)
    const F: number[][] = [
      [1, 0],
      [0, 1],
    ]

    const hedgeRatios: number[] = []
    const alphas: number[] = []

    // Fill initial values for the first initialLookback days
    for (let i = 0; i < initialLookback; i++) {
      hedgeRatios.push(initialBeta)
      alphas.push(initialAlpha)
    }

    // Process remaining data points with Kalman filter
    for (let i = initialLookback; i < n; i++) {
      const priceA = typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
      const priceB = typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close

      // Prediction step
      // x_pred = F @ x (F is identity, so x_pred = x)
      const x_pred = [...x]

      // P_pred = F @ P @ F.T + Q (F is identity, so P_pred = P + Q)
      const P_pred = matrixAdd2x2(P, Q)

      // Update step
      // Observation matrix H_t = [1, priceB]
      const H_t = [1, priceB]

      // Innovation: y - H @ x_pred
      const predicted_y = H_t[0] * x_pred[0] + H_t[1] * x_pred[1] // H_t @ x_pred
      const innovation = priceA - predicted_y

      // Innovation covariance: H @ P_pred @ H.T + R
      const H_P_pred = [P_pred[0][0] * H_t[0] + P_pred[0][1] * H_t[1], P_pred[1][0] * H_t[0] + P_pred[1][1] * H_t[1]] // 2x1
      const innovation_covariance = H_P_pred[0] * H_t[0] + H_P_pred[1] * H_t[1] + adaptiveR // scalar

      // Kalman gain: P_pred @ H.T @ inv(innovation_covariance)
      const P_pred_H_T = [P_pred[0][0] * H_t[0] + P_pred[0][1] * H_t[1], P_pred[1][0] * H_t[0] + P_pred[1][1] * H_t[1]] // 2x1
      const K = [
        P_pred_H_T[0] * scalarInverse(innovation_covariance),
        P_pred_H_T[1] * scalarInverse(innovation_covariance),
      ] // 2x1

      // Update state: x = x_pred + K @ innovation
      x = [x_pred[0] + K[0] * innovation, x_pred[1] + K[1] * innovation]

      // Update covariance: P = (I - K @ H) @ P_pred
      const K_H = [
        [K[0] * H_t[0], K[0] * H_t[1]],
        [K[1] * H_t[0], K[1] * H_t[1]],
      ] // 2x2

      const I_minus_KH = matrixSubtract2x2(
        [
          [1, 0],
          [0, 1],
        ],
        K_H,
      )
      P = matrixMultiply2x2(I_minus_KH, P_pred)

      // Store results
      alphas.push(x[0])
      hedgeRatios.push(x[1])

      // Debug output for last few iterations
      if (i >= n - 3) {
        console.log(`=== KALMAN UPDATE ${i + 1}/${n} ===`)
        console.log(`Price A: ${priceA.toFixed(2)}, Price B: ${priceB.toFixed(2)}`)
        console.log(`Predicted: ${predicted_y.toFixed(4)}, Actual: ${priceA.toFixed(4)}`)
        console.log(`Innovation: ${innovation.toFixed(4)}`)
        console.log(`Updated Alpha: ${x[0].toFixed(4)}, Beta: ${x[1].toFixed(4)}`)
        console.log(`Kalman Gain: [${K[0].toFixed(6)}, ${K[1].toFixed(6)}]`)
      }
    }

    console.log("=== FINAL KALMAN RESULTS ===")
    console.log(`Final Alpha: ${alphas[alphas.length - 1].toFixed(4)}`)
    console.log(`Final Beta: ${hedgeRatios[hedgeRatios.length - 1].toFixed(4)}`)
    console.log(`Total iterations: ${n - initialLookback}`)
    console.log("=====================================")

    return { hedgeRatios, alphas }
  }

  const runEuclideanAnalysis = async () => {
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

      if (pricesA.length < euclideanLookbackWindow || pricesB.length < euclideanLookbackWindow) {
        setError(`Not enough data points for the selected lookback window (${euclideanLookbackWindow} days).`)
        setIsLoading(false)
        return
      }

      const minLength = Math.min(pricesA.length, pricesB.length)
      const dates = []
      const stockAPrices = []
      const stockBPrices = []
      const normalizedPricesA = []
      const normalizedPricesB = []
      const distances = []

      // Step 2: Price Normalization
      const initialPriceA =
        typeof pricesA[0].close === "string" ? Number.parseFloat(pricesA[0].close) : pricesA[0].close
      const initialPriceB =
        typeof pricesB[0].close === "string" ? Number.parseFloat(pricesB[0].close) : pricesB[0].close

      for (let i = 0; i < minLength; i++) {
        const currentPriceA =
          typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
        const currentPriceB =
          typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close

        const normalizedA = currentPriceA / initialPriceA
        const normalizedB = currentPriceB / initialPriceB

        // Step 3: Euclidean Distance Calculation
        const distance = Math.abs(normalizedA - normalizedB) // Simplified sqrt((x-y)^2)

        dates.push(pricesA[i].date)
        stockAPrices.push(currentPriceA)
        stockBPrices.push(currentPriceB)
        normalizedPricesA.push(normalizedA)
        normalizedPricesB.push(normalizedB)
        distances.push(distance)
      }

      // Step 4 & 5: Rolling Mean, Std Dev, and Z-score Calculation for Distance
      const rollingMeanDistance = []
      const rollingStdDistance = []
      const zScores = []

      for (let i = 0; i < distances.length; i++) {
        const windowStart = Math.max(0, i - euclideanLookbackWindow + 1)
        const windowData = distances.slice(windowStart, i + 1)

        const mean = windowData.reduce((sum, val) => sum + val, 0) / windowData.length
        const stdDev = Math.sqrt(windowData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / windowData.length)

        rollingMeanDistance.push(mean)
        rollingStdDistance.push(stdDev)

        if (stdDev > 0) {
          zScores.push((distances[i] - mean) / stdDev)
        } else {
          zScores.push(0) // Or NaN, depending on desired behavior for zero std dev
        }
      }

      // Calculate statistics
      const meanDistance = distances.reduce((sum, val) => sum + val, 0) / distances.length
      const stdDevDistance = Math.sqrt(
        distances.reduce((sum, val) => sum + Math.pow(val - meanDistance, 2), 0) / distances.length,
      )

      const validZScores = zScores.filter((z) => !isNaN(z))
      const minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      const maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      const correlation = calculateCorrelation(pricesA.slice(0, minLength), pricesB.slice(0, minLength))
      const adfResults = adfTest(distances)
      const halfLifeResult = calculateHalfLife(distances)
      const hurstExponent = calculateHurstExponent(distances)
      const practicalTradeHalfLife = calculatePracticalTradeHalfLife(zScores, entryThreshold, exitThreshold)

      // Prepare table data
      const tableData = []
      const rollingHalfLifes = calculateRollingHalfLife(distances, euclideanLookbackWindow)

      for (let i = 0; i < dates.length; i++) {
        tableData.push({
          date: dates[i],
          priceA: stockAPrices[i],
          priceB: stockBPrices[i],
          normalizedA: normalizedPricesA[i],
          normalizedB: normalizedPricesB[i],
          distance: distances[i],
          zScore: zScores[i],
          halfLife: rollingHalfLifes[i] !== null ? rollingHalfLifes[i].toFixed(2) : "N/A", // Assuming rollingHalfLifes is calculated for distances
        })
      }

      setAnalysisData({
        dates,
        distances,
        zScores,
        stockAPrices,
        stockBPrices,
        normalizedPricesA,
        normalizedPricesB,
        statistics: {
          correlation,
          meanDistance,
          stdDevDistance,
          minZScore,
          maxZScore,
          adfResults,
          halfLife: halfLifeResult.halfLife,
          halfLifeValid: halfLifeResult.isValid,
          hurstExponent,
          practicalTradeHalfLife,
          modelType: "euclidean",
        },
        tableData,
        chartData: {
          rollingMean: rollingMeanDistance,
          rollingUpperBand1: rollingMeanDistance.map((m, i) => m + rollingStdDistance[i]),
          rollingLowerBand1: rollingMeanDistance.map((m, i) => m - rollingStdDistance[i]),
          rollingUpperBand2: rollingMeanDistance.map((m, i) => m + 2 * rollingStdDistance[i]),
          rollingLowerBand2: rollingMeanDistance.map((m, i) => m - 2 * rollingStdDistance[i]),
        },
      })
    } catch (error) {
      console.error("Error in Euclidean analysis:", error)
      setError("An error occurred during Euclidean distance analysis. Please try again.")
    } finally {
      setIsLoading(false)
    }
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

      if (pricesA.length === 0 || pricesB.length === 0) {
        setError("No data available for the selected date range.")
        setIsLoading(false)
        return
      }

      const minLength = Math.min(pricesA.length, pricesB.length)
      const dates = []
      const ratios = []
      const stockAPrices = []
      const stockBPrices = []

      for (let i = 0; i < minLength; i++) {
        const priceA = typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
        const priceB = typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close

        if (priceB === 0) {
          console.warn(`Price of stock B is zero on ${pricesA[i].date}. Skipping this data point.`)
          continue // Skip this iteration if priceB is zero to avoid division by zero
        }

        const ratio = priceA / priceB

        dates.push(pricesA[i].date)
        ratios.push(ratio)
        stockAPrices.push(priceA)
        stockBPrices.push(priceB)
      }

      // Rolling statistics calculation
      const rollingMean = []
      const rollingStd = []
      const zScores = []

      for (let i = 0; i < ratios.length; i++) {
        const windowStart = Math.max(0, i - ratioLookbackWindow + 1)
        const windowData = ratios.slice(windowStart, i + 1)

        const mean = windowData.reduce((sum, val) => sum + val, 0) / windowData.length
        const std = Math.sqrt(windowData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / windowData.length)

        rollingMean.push(mean)
        rollingStd.push(std)

        if (std === 0) {
          zScores.push(0) // Or handle as appropriate, e.g., NaN or skip
        } else {
          zScores.push((ratios[i] - mean) / std)
        }
      }

      // Calculate statistics
      const meanRatio = ratios.reduce((sum, val) => sum + val, 0) / ratios.length
      const stdDevRatio = Math.sqrt(ratios.reduce((sum, val) => sum + Math.pow(val - meanRatio, 2), 0) / ratios.length)

      const validZScores = zScores.filter((z) => !isNaN(z))
      const minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      const maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      const correlation = calculateCorrelation(pricesA.slice(0, minLength), pricesB.slice(0, minLength))
      const adfResults = adfTest(ratios)
      const halfLifeResult = calculateHalfLife(ratios)
      const hurstExponent = calculateHurstExponent(ratios)
      const practicalTradeHalfLife = calculatePracticalTradeHalfLife(zScores, entryThreshold, exitThreshold)

      // Prepare table data
      const tableData = []
      for (let i = 0; i < dates.length; i++) {
        tableData.push({
          date: dates[i],
          priceA: stockAPrices[i],
          priceB: stockBPrices[i],
          ratio: ratios[i],
          zScore: zScores[i],
          halfLife: halfLifeResult.halfLife.toFixed(2),
        })
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
          rollingUpperBand1: rollingMean.map((m, i) => m + rollingStd[i]),
          rollingLowerBand1: rollingMean.map((m, i) => m - rollingStd[i]),
          rollingUpperBand2: rollingMean.map((m, i) => m + 2 * rollingStd[i]),
          rollingLowerBand2: rollingMean.map((m, i) => m - 2 * rollingStd[i]),
        },
      })
    } catch (error) {
      console.error("Error in ratio analysis:", error)
      setError("An error occurred during ratio analysis. Please try again.")
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

      if (pricesA.length === 0 || pricesB.length === 0) {
        setError("No data available for the selected date range.")
        setIsLoading(false)
        return
      }

      const minLength = Math.min(pricesA.length, pricesB.length)
      const dates = []
      const spreads = []
      const hedgeRatios = []
      const alphas = []
      const stockAPrices = []
      const stockBPrices = []

      for (let i = 0; i < minLength; i++) {
        stockAPrices.push(typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close)
        stockBPrices.push(typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close)
      }

      // Calculate rolling hedge ratio and spread
      for (let i = 0; i < minLength; i++) {
        const { beta, alpha } = calculateHedgeRatio(pricesA, pricesB, i, olsLookbackWindow)
        hedgeRatios.push(beta)
        alphas.push(alpha)

        const spread = stockAPrices[i] - beta * stockBPrices[i] - alpha
        spreads.push(spread)
        dates.push(pricesA[i].date)
      }

      // Calculate rolling statistics on the spread
      const rollingMean = []
      const rollingStd = []
      const zScores = []

      for (let i = 0; i < spreads.length; i++) {
        const windowStart = Math.max(0, i - zScoreLookback + 1)
        const windowData = spreads.slice(windowStart, i + 1)

        const mean = windowData.reduce((sum, val) => sum + val, 0) / windowData.length
        const std = Math.sqrt(windowData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / windowData.length)

        rollingMean.push(mean)
        rollingStd.push(std)

        if (std === 0) {
          zScores.push(0) // Or handle as appropriate, e.g., NaN or skip
        } else {
          zScores.push((spreads[i] - mean) / std)
        }
      }

      // Calculate statistics
      const meanSpread = spreads.reduce((sum, val) => sum + val, 0) / spreads.length
      const stdDevSpread = Math.sqrt(
        spreads.reduce((sum, val) => sum + Math.pow(val - meanSpread, 2), 0) / spreads.length,
      )

      const validZScores = zScores.filter((z) => !isNaN(z))
      const minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      const maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      const correlation = calculateCorrelation(pricesA.slice(0, minLength), pricesB.slice(0, minLength))
      const adfResults = adfTest(spreads)
      const halfLifeResult = calculateHalfLife(spreads)
      const hurstExponent = calculateHurstExponent(spreads)
      const practicalTradeHalfLife = calculatePracticalTradeHalfLife(zScores, entryThreshold, exitThreshold)

      // Prepare table data
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
          halfLife: halfLifeResult.halfLife.toFixed(2),
        })
      }

      setAnalysisData({
        dates,
        spreads,
        zScores,
        hedgeRatios,
        alphas,
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
          rollingUpperBand1: rollingMean.map((m, i) => m + rollingStd[i]),
          rollingLowerBand1: rollingMean.map((m, i) => m - rollingStd[i]),
          rollingUpperBand2: rollingMean.map((m, i) => m + 2 * rollingStd[i]),
          rollingLowerBand2: rollingMean.map((m, i) => m - 2 * rollingStd[i]),
        },
      })
    } catch (error) {
      console.error("Error in OLS analysis:", error)
      setError("An error occurred during OLS analysis. Please try again.")
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

      if (pricesA.length === 0 || pricesB.length === 0) {
        setError("No data available for the selected date range.")
        setIsLoading(false)
        return
      }

      const minLength = Math.min(pricesA.length, pricesB.length)
      const dates = []
      const spreads = []
      const hedgeRatios = []
      const alphas = []
      const stockAPrices = []
      const stockBPrices = []

      for (let i = 0; i < minLength; i++) {
        stockAPrices.push(typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close)
        stockBPrices.push(typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close)
      }

      // Run Kalman filter
      const { hedgeRatios: kalmanHedgeRatios, alphas: kalmanAlphas } = kalmanFilter(
        pricesA,
        pricesB,
        kalmanProcessNoise,
        kalmanMeasurementNoise,
        kalmanInitialLookback,
      )

      // Calculate spread using Kalman filter outputs
      for (let i = 0; i < minLength; i++) {
        const spread = stockAPrices[i] - kalmanHedgeRatios[i] * stockBPrices[i] - kalmanAlphas[i]
        spreads.push(spread)
        hedgeRatios.push(kalmanHedgeRatios[i])
        alphas.push(kalmanAlphas[i])
        dates.push(pricesA[i].date)
      }

      // Calculate rolling statistics on the spread
      const rollingMean = []
      const rollingStd = []
      const zScores = []

      for (let i = 0; i < spreads.length; i++) {
        const windowStart = Math.max(0, i - zScoreLookback + 1)
        const windowData = spreads.slice(windowStart, i + 1)

        const mean = windowData.reduce((sum, val) => sum + val, 0) / windowData.length
        const std = Math.sqrt(windowData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / windowData.length)

        rollingMean.push(mean)
        rollingStd.push(std)

        if (std === 0) {
          zScores.push(0) // Or handle as appropriate, e.g., NaN or skip
        } else {
          zScores.push((spreads[i] - mean) / std)
        }
      }

      // Calculate statistics
      const meanSpread = spreads.reduce((sum, val) => sum + val, 0) / spreads.length
      const stdDevSpread = Math.sqrt(
        spreads.reduce((sum, val) => sum + Math.pow(val - meanSpread, 2), 0) / spreads.length,
      )

      const validZScores = zScores.filter((z) => !isNaN(z))
      const minZScore = validZScores.length > 0 ? Math.min(...validZScores) : 0
      const maxZScore = validZScores.length > 0 ? Math.max(...validZScores) : 0

      const correlation = calculateCorrelation(pricesA.slice(0, minLength), pricesB.slice(0, minLength))
      const adfResults = adfTest(spreads)
      const halfLifeResult = calculateHalfLife(spreads)
      const hurstExponent = calculateHurstExponent(spreads)
      const practicalTradeHalfLife = calculatePracticalTradeHalfLife(zScores, entryThreshold, exitThreshold)

      // Prepare table data
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
          halfLife: halfLifeResult.halfLife.toFixed(2),
        })
      }

      setAnalysisData({
        dates,
        spreads,
        zScores,
        hedgeRatios,
        alphas,
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
          rollingUpperBand1: rollingMean.map((m, i) => m + rollingStd[i]),
          rollingLowerBand1: rollingMean.map((m, i) => m - rollingStd[i]),
          rollingUpperBand2: rollingMean.map((m, i) => m + 2 * rollingStd[i]),
          rollingLowerBand2: rollingMean.map((m, i) => m - 2 * rollingStd[i]),
        },
      })
    } catch (error) {
      console.error("Error in Kalman analysis:", error)
      setError("An error occurred during Kalman analysis. Please try again.")
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
    } else if (activeTab === "euclidean") {
      runEuclideanAnalysis()
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
            <button
              onClick={() => setActiveTab("euclidean")}
              className={`px-4 py-2 font-medium ${
                activeTab === "euclidean"
                  ? "text-gold-400 border-b-2 border-gold-400"
                  : "text-gray-300 hover:text-white"
              }`}
            >
              Euclidean Distance Model
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
          ) : activeTab === "kalman" ? (
            <>
              <div>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className="block text-base font-medium text-gray-300 mb-2">Kalman Filter Parameters</label>
                    <p className="mt-1 text-sm text-gray-400">
                      Improved 2D Kalman filter tracks both alpha and beta. Process noise controls adaptation speed.
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Process Noise</label>
                        <input
                          type="number"
                          value={kalmanProcessNoise}
                          onChange={(e) => setKalmanProcessNoise(Number.parseFloat(e.target.value))}
                          min="0.00001"
                          max="0.01"
                          step="0.00001"
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Initial Lookback</label>
                        <input
                          type="number"
                          value={kalmanInitialLookback}
                          onChange={(e) => setKalmanInitialLookback(Number.parseInt(e.target.value))}
                          min="30"
                          max="120"
                          className="input-field"
                        />
                      </div>
                    </div>
                  </div>
                </div>
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
          ) : activeTab === "euclidean" ? (
            <div>
              <label className="block text-base font-medium text-gray-300 mb-2">Euclidean Lookback Window (Days)</label>
              <input
                type="number"
                value={euclideanLookbackWindow}
                onChange={(e) => setEuclideanLookbackWindow(Number.parseInt(e.target.value))}
                min="10"
                max="252"
                className="input-field"
              />
              <p className="mt-1 text-sm text-gray-400">
                Window size for rolling mean and standard deviation of Euclidean distance
              </p>
            </div>
          ) : (
            <>
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
                      Mean{" "}
                      {analysisData.statistics.modelType === "ratio"
                        ? "Ratio"
                        : analysisData.statistics.modelType === "euclidean"
                          ? "Distance"
                          : "Spread"}
                      :
                    </span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.modelType === "ratio"
                        ? analysisData.statistics.meanRatio.toFixed(4)
                        : analysisData.statistics.modelType === "euclidean"
                          ? analysisData.statistics.meanDistance.toFixed(4)
                          : analysisData.statistics.meanSpread.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">
                      Std Dev{" "}
                      {analysisData.statistics.modelType === "ratio"
                        ? "Ratio"
                        : analysisData.statistics.modelType === "euclidean"
                          ? "Distance"
                          : "Spread"}
                      :
                    </span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.modelType === "ratio"
                        ? analysisData.statistics.stdDevRatio.toFixed(4)
                        : analysisData.statistics.modelType === "euclidean"
                          ? analysisData.statistics.stdDevDistance.toFixed(4)
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
                          : analysisData.statistics.modelType === "euclidean"
                            ? analysisData.statistics.stdDevDistance > 0
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
                          : analysisData.statistics.modelType === "euclidean"
                            ? analysisData.statistics.stdDevDistance > 0
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
                          : analysisData.statistics.modelType === "euclidean"
                            ? analysisData.statistics.stdDevDistance > 0
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
              {analysisData.statistics.modelType !== "ratio" && analysisData.statistics.modelType !== "euclidean" && (
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
                    {analysisData.statistics.modelType === "kalman" &&
                      " The improved Kalman filter provides more stable and accurate estimates."}
                  </p>
                </div>
              )}

              <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700">
                <h3 className="text-xl font-semibold text-white mb-4">
                  {analysisData.statistics.modelType === "ratio"
                    ? "Ratio Chart"
                    : analysisData.statistics.modelType === "euclidean"
                      ? "Euclidean Distance Chart"
                      : "Spread Chart"}
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
                              : analysisData.statistics.modelType === "euclidean"
                                ? analysisData.distances[i]
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
                              : analysisData.statistics.modelType === "euclidean"
                                ? analysisData.distances[i]
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
                            value:
                              analysisData.statistics.modelType === "ratio"
                                ? "Ratio"
                                : analysisData.statistics.modelType === "euclidean"
                                  ? "Distance"
                                  : "Spread",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#dce5f3",
                          }}
                        />
                        <ZAxis range={[15, 15]} />
                        <Tooltip
                          cursor={{ strokeDasharray: "3 3" }}
                          contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                          formatter={(value) => [value.toFixed(4), "Value"]}
                        />
                        <Scatter
                          name={
                            analysisData.statistics.modelType === "ratio"
                              ? "Ratio"
                              : analysisData.statistics.modelType === "euclidean"
                                ? "Distance"
                                : "Spread"
                          }
                          data={analysisData.dates.map((date, i) => ({
                            date: i,
                            value:
                              analysisData.statistics.modelType === "ratio"
                                ? analysisData.ratios[i]
                                : analysisData.statistics.modelType === "euclidean"
                                  ? analysisData.distances[i]
                                  : analysisData.spreads[i],
                          }))}
                          fill="#ffd700"
                        />
                      </ScatterChart>
                    ) : (
                      // Histogram
                      (() => {
                        const data =
                          analysisData.statistics.modelType === "ratio"
                            ? analysisData.ratios
                            : analysisData.statistics.modelType === "euclidean"
                              ? analysisData.distances
                              : analysisData.spreads
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
                  This chart shows the{" "}
                  {analysisData.statistics.modelType === "ratio"
                    ? "ratio"
                    : analysisData.statistics.modelType === "euclidean"
                      ? "Euclidean distance"
                      : "spread"}{" "}
                  between {selectedPair.stockA} and {selectedPair.stockB}
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
                        {(() => {
                          if (
                            (analysisData.statistics.modelType === "ols" ||
                              analysisData.statistics.modelType === "kalman") &&
                            analysisData.stockBPrices.length > 0
                          ) {
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
                      {analysisData.statistics.modelType !== "ratio" &&
                        analysisData.statistics.modelType !== "euclidean" && (
                          <>
                            <th className="table-header">Alpha (α)</th>
                            <th className="table-header">Hedge Ratio (β)</th>
                          </>
                        )}
                      <th className="table-header">
                        {analysisData.statistics.modelType === "ratio"
                          ? "Ratio"
                          : analysisData.statistics.modelType === "euclidean"
                            ? "Distance"
                            : "Spread"}
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
                        {analysisData.statistics.modelType !== "ratio" &&
                          analysisData.statistics.modelType !== "euclidean" && (
                            <>
                              <td className="table-cell">{row.alpha.toFixed(4)}</td>
                              <td className="table-cell">{row.hedgeRatio.toFixed(4)}</td>
                            </>
                          )}
                        <td className="table-cell">
                          {analysisData.statistics.modelType === "ratio"
                            ? row.ratio.toFixed(4)
                            : analysisData.statistics.modelType === "euclidean"
                              ? row.distance.toFixed(4)
                              : row.spread.toFixed(4)}
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
                        <td className="table-cell">{row.halfLife || "N/A"}</td>
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
