"use client"

import { useState, useEffect } from "react"
import { openDB } from "idb"
import calculateZScore from "../utils/calculations"
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

// Matrix operations for 2x2 matrices (copied from pair-analyzer.tsx)
const matrixMultiply2x2 = (A: number[][], B: number[][]): number[][] => {
  return [
    [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
    [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
  ]
}

const matrixSubtract2x2 = (A: number[][], B: number[][]): number[][] => {
  return [
    [A[0][0] - B[0][0], A[0][1] - B[0][1]],
    [A[1][0] - B[1][0], A[1][1] - B[1][1]],
  ]
}

const matrixAdd2x2 = (A: number[][], B: number[][]): number[][] => {
  return [
    [A[0][0] + B[0][0], A[0][1] + B[0][1]],
    [A[1][0] + B[1][0], A[1][1] + B[1][1]],
  ]
}

const scalarInverse = (x: number): number => {
  return Math.abs(x) < 1e-10 ? 1.0 : 1.0 / x
}

// Kalman filter implementation (copied from pair-analyzer.tsx)
const kalmanFilter = (
  pricesA: { close: number; date: string }[],
  pricesB: { close: number; date: string }[],
  processNoise = 0.0001,
  initialLookback = 60,
) => {
  const n = pricesA.length

  if (n < initialLookback) {
    console.warn(`Not enough data for Kalman filter initialization. Need ${initialLookback}, got ${n}`)
    return { hedgeRatios: Array(n).fill(1), alphas: Array(n).fill(0), spreads: Array(n).fill(0) }
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

  const hedgeRatios: number[] = []
  const alphas: number[] = []
  const spreads: number[] = []

  // Fill initial values for the first initialLookback days
  for (let i = 0; i < initialLookback; i++) {
    hedgeRatios.push(initialBeta)
    alphas.push(initialAlpha)
    const priceA = typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
    const priceB = typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close
    spreads.push(priceA - (initialAlpha + initialBeta * priceB))
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
    spreads.push(priceA - (x[0] + x[1] * priceB))
  }

  return { hedgeRatios, alphas, spreads }
}

export default function BacktestKalman() {
  const [stocks, setStocks] = useState([])
  const [selectedPair, setSelectedPair] = useState({ stockA: "", stockB: "" })
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [entryZ, setEntryZ] = useState(2.0)
  const [exitZ, setExitZ] = useState(1.5)
  const [backtestData, setBacktestData] = useState([])
  const [tradeResults, setTradeResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [capitalPerTrade, setCapitalPerTrade] = useState(100000)
  const [riskFreeRate, setRiskFreeRate] = useState(0.02) // 2% annual risk-free rate
  const [equityCurveData, setEquityCurveData] = useState([])

  // Stop Loss & Target Parameters
  const [timeStopDays, setTimeStopDays] = useState(15)
  const [lossStopPercent, setLossStopPercent] = useState(-10)
  const [targetProfitPercent, setTargetProfitPercent] = useState(10)

  // Kalman specific parameters
  const [kalmanProcessNoise, setKalmanProcessNoise] = useState(0.0001)
  const [kalmanInitialLookback, setKalmanInitialLookback] = useState(60)
  const [zScoreLookback, setZScoreLookback] = useState(30) // For Z-score calculation on Kalman spread

  useEffect(() => {
    const fetchStocks = async () => {
      try {
        const db = await openDB("StockDatabase", 2)
        const tx = db.transaction("stocks", "readonly")
        const store = tx.objectStore("stocks")
        const allStocks = await store.getAll()
        if (!allStocks.length) return
        setStocks(allStocks.map((stock) => stock.symbol))

        // Check for URL parameters
        const urlParams = new URLSearchParams(window.location.search)
        const stockA = urlParams.get("stockA")
        const stockB = urlParams.get("stockB")

        if (stockA && stockB) {
          setSelectedPair({
            stockA,
            stockB,
          })

          // Set default date range if not already set
          if (!fromDate || !toDate) {
            const today = new Date()
            const oneYearAgo = new Date()
            oneYearAgo.setFullYear(today.getFullYear() - 1)

            setFromDate(oneYearAgo.toISOString().split("T")[0])
            setToDate(today.toISOString().split("T")[0])

            // We'll run the backtest after the state updates
            setTimeout(() => {
              const runBacktestButton = document.querySelector("button.btn-primary")
              if (runBacktestButton) {
                runBacktestButton.click()
              }
            }, 500)
          }
        }
      } catch (error) {
        console.error("Error fetching stocks:", error)
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

  const calculateAdvancedMetrics = (trades) => {
    if (trades.length === 0) return {}

    const pnlKey = "pnl"
    const roiKey = "roi"

    // Separate trades by direction
    const longTrades = trades.filter((t) => t.type === "LONG")
    const shortTrades = trades.filter((t) => t.type === "SHORT")

    // Calculate directional metrics
    const longWins = longTrades.filter((t) => Number.parseFloat(t[pnlKey]) > 0)
    const longLosses = longTrades.filter((t) => Number.parseFloat(t[pnlKey]) <= 0)
    const shortWins = shortTrades.filter((t) => Number.parseFloat(t[pnlKey]) > 0)
    const shortLosses = shortTrades.filter((t) => Number.parseFloat(t[pnlKey]) <= 0)

    const longWinRate = longTrades.length > 0 ? (longWins.length / longTrades.length) * 100 : 0
    const longLossRate = longTrades.length > 0 ? (longLosses.length / longTrades.length) * 100 : 0
    const shortWinRate = shortTrades.length > 0 ? (shortWins.length / shortTrades.length) * 100 : 0
    const shortLossRate = shortTrades.length > 0 ? (shortLosses.length / shortTrades.length) * 100 : 0

    // Calculate average wins/losses
    const avgLongWin =
      longWins.length > 0 ? longWins.reduce((sum, t) => sum + Number.parseFloat(t[pnlKey]), 0) / longWins.length : 0
    const avgLongLoss =
      longLosses.length > 0
        ? longLosses.reduce((sum, t) => sum + Number.parseFloat(t[pnlKey]), 0) / longLosses.length
        : 0
    const avgShortWin =
      shortWins.length > 0 ? shortWins.reduce((sum, t) => sum + Number.parseFloat(t[pnlKey]), 0) / shortWins.length : 0
    const avgShortLoss =
      shortLosses.length > 0
        ? shortLosses.reduce((sum, t) => sum + Number.parseFloat(t[pnlKey]), 0) / shortLosses.length
        : 0

    // Overall metrics
    const allWins = trades.filter((t) => Number.parseFloat(t[pnlKey]) > 0)
    const allLosses = trades.filter((t) => Number.parseFloat(t[pnlKey]) <= 0)

    const grossProfit = allWins.reduce((sum, t) => sum + Number.parseFloat(t[pnlKey]), 0)
    const grossLoss = Math.abs(allLosses.reduce((sum, t) => sum + Number.parseFloat(t[pnlKey]), 0))
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Number.POSITIVE_INFINITY : 0

    const avgWin = allWins.length > 0 ? grossProfit / allWins.length : 0
    const avgLoss = allLosses.length > 0 ? grossLoss / allLosses.length : 0
    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Number.POSITIVE_INFINITY : 0

    const winRate = trades.length > 0 ? (allWins.length / trades.length) * 100 : 0
    const expectancy = (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss

    // Calculate Sharpe Ratio
    const returns = trades.map((t) => Number.parseFloat(t[roiKey]) / 100) // Convert percentage to decimal
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length
    const returnStdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
    const annualizedReturn =
      avgReturn * (252 / (trades.reduce((sum, t) => sum + Number.parseInt(t.holdingPeriod), 0) / trades.length)) // Assuming average holding period
    const annualizedStdDev =
      returnStdDev *
      Math.sqrt(252 / (trades.reduce((sum, t) => sum + Number.parseInt(t.holdingPeriod), 0) / trades.length))
    const sharpeRatio = annualizedStdDev > 0 ? (annualizedReturn - riskFreeRate) / annualizedStdDev : 0

    // Calculate Maximum Drawdown
    let runningPnL = 0
    let peak = 0
    let maxDrawdown = 0

    trades.forEach((trade) => {
      runningPnL += Number.parseFloat(trade[pnlKey])
      if (runningPnL > peak) {
        peak = runningPnL
      }
      const drawdown = peak - runningPnL
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown
      }
    })

    // Best and worst trades
    const bestTrade = trades.reduce(
      (best, current) => (Number.parseFloat(current[pnlKey]) > Number.parseFloat(best[pnlKey]) ? current : best),
      trades[0],
    )
    const worstTrade = trades.reduce(
      (worst, current) => (Number.parseFloat(current[pnlKey]) < Number.parseFloat(worst[pnlKey]) ? current : worst),
      trades[0],
    )

    // Consecutive wins/losses
    let maxConsecutiveWins = 0
    let maxConsecutiveLosses = 0
    let currentWinStreak = 0
    let currentLossStreak = 0

    trades.forEach((trade) => {
      if (Number.parseFloat(trade[pnlKey]) > 0) {
        currentWinStreak++
        currentLossStreak = 0
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak)
      } else {
        currentLossStreak++
        currentWinStreak = 0
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak)
      }
    })

    // Average holding periods
    const avgHoldingPeriod = trades.reduce((sum, t) => sum + Number.parseInt(t.holdingPeriod), 0) / trades.length
    const avgLongHoldingPeriod =
      longTrades.length > 0
        ? longTrades.reduce((sum, t) => sum + Number.parseInt(t.holdingPeriod), 0) / longTrades.length
        : 0
    const avgShortHoldingPeriod =
      shortTrades.length > 0
        ? shortTrades.reduce((sum, t) => sum + Number.parseInt(t.holdingPeriod), 0) / shortTrades.length
        : 0

    return {
      // Directional Analysis
      longTrades: longTrades.length,
      shortTrades: shortTrades.length,
      longWinRate,
      longLossRate,
      shortWinRate,
      shortLossRate,
      avgLongWin,
      avgLongLoss,
      avgShortWin,
      avgShortLoss,

      // Risk Metrics
      sharpeRatio,
      maxDrawdown,
      profitFactor,
      expectancy,
      winLossRatio,

      // Additional Metrics
      bestTrade: Number.parseFloat(bestTrade[pnlKey]),
      worstTrade: Number.parseFloat(worstTrade[pnlKey]),
      maxConsecutiveWins,
      maxConsecutiveLosses,
      avgHoldingPeriod,
      avgLongHoldingPeriod,
      avgShortHoldingPeriod,
      grossProfit,
      grossLoss,
      avgWin,
      avgLoss,
    }
  }

  const runBacktest = async () => {
    if (!selectedPair.stockA || !selectedPair.stockB) {
      alert("Please select two stocks.")
      return
    }

    setIsLoading(true)

    try {
      const db = await openDB("StockDatabase", 2)
      const tx = db.transaction("stocks", "readonly")
      const store = tx.objectStore("stocks")
      const stockAData = await store.get(selectedPair.stockA)
      const stockBData = await store.get(selectedPair.stockB)

      if (!stockAData || !stockBData) {
        alert("Stock data not found.")
        setIsLoading(false)
        return
      }

      // Filter and sort data by date
      const pricesA = filterByDate(stockAData.data).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )
      const pricesB = filterByDate(stockBData.data).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )

      // Ensure both arrays have the same dates
      const commonDates = pricesA
        .filter((a) => pricesB.some((b) => b.date === a.date))
        .map((a) => a.date)
        .sort()

      const alignedPricesA = commonDates.map((date) => pricesA.find((p) => p.date === date)).filter(Boolean)
      const alignedPricesB = commonDates.map((date) => pricesB.find((p) => p.date === date)).filter(Boolean)

      const minLength = Math.min(alignedPricesA.length, alignedPricesB.length)

      if (minLength < kalmanInitialLookback) {
        alert(
          `Insufficient data for Kalman initialization. Need at least ${kalmanInitialLookback} days, but only have ${minLength} days.`,
        )
        setIsLoading(false)
        return
      }

      // Run Kalman filter to get dynamic alpha, beta, and spreads
      const {
        hedgeRatios,
        alphas,
        spreads: kalmanSpreads,
      } = kalmanFilter(alignedPricesA, alignedPricesB, kalmanProcessNoise, kalmanInitialLookback)

      // Calculate Z-scores for Kalman spreads
      const zScores = []
      for (let i = 0; i < minLength; i++) {
        const windowData = kalmanSpreads.slice(Math.max(0, i - zScoreLookback + 1), i + 1)
        zScores.push(calculateZScore(windowData).pop()) // Use the imported calculateZScore and get the last element
      }

      const tableData = kalmanSpreads.map((spread, index) => ({
        date: alignedPricesA[index].date,
        stockAClose: alignedPricesA[index].close,
        stockBClose: alignedPricesB[index].close,
        alpha: alphas[index],
        hedgeRatio: hedgeRatios[index],
        spread: spread,
        zScore: zScores[index] || 0,
        index: index,
      }))

      setBacktestData(tableData)

      // Run backtest logic
      const trades = []
      let openTrade = null
      let cumulativePnl = 0
      const tempEquityCurveData = [{ date: fromDate, cumulativePnl: 0 }] // Initialize equity curve

      for (let i = kalmanInitialLookback; i < tableData.length; i++) {
        const prevZ = i > 0 ? tableData[i - 1].zScore : 0
        const currZ = tableData[i].zScore
        const currentRow = tableData[i]

        if (!openTrade) {
          // Entry conditions
          if (prevZ > -entryZ && currZ <= -entryZ) {
            // Long entry (spread is oversold)
            openTrade = {
              entryDate: currentRow.date,
              entryIndex: i,
              type: "LONG",
              entrySpread: currentRow.spread,
              entryHedgeRatio: currentRow.hedgeRatio,
              entryAlpha: currentRow.alpha,
              entryZScore: currZ,
              entryStockAPrice: currentRow.stockAClose,
              entryStockBPrice: currentRow.stockBClose,
            }
          } else if (prevZ < entryZ && currZ >= entryZ) {
            // Short entry (spread is overbought)
            openTrade = {
              entryDate: currentRow.date,
              entryIndex: i,
              type: "SHORT",
              entrySpread: currentRow.spread,
              entryHedgeRatio: currentRow.hedgeRatio,
              entryAlpha: currentRow.alpha,
              entryZScore: currZ,
              entryStockAPrice: currentRow.stockAClose,
              entryStockBPrice: currentRow.stockBClose,
            }
          }
        } else {
          const entryDate = new Date(openTrade.entryDate)
          const currentDate = new Date(currentRow.date)
          const holdingPeriod = Math.floor((currentDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))

          // Calculate current P&L and ROI using the *current* Kalman parameters
          const currentHedgeRatio = currentRow.hedgeRatio
          const currentAlpha = currentRow.alpha

          let currentPnL
          // For Kalman, we assume a market-neutral position based on the current hedge ratio
          // We need to calculate the P&L based on the change in the spread value
          // P&L = (Current Spread - Entry Spread) for LONG, or (Entry Spread - Current Spread) for SHORT
          if (openTrade.type === "LONG") {
            currentPnL = currentRow.spread - openTrade.entrySpread
          } else {
            currentPnL = openTrade.entrySpread - currentRow.spread
          }

          // For ROI, we need a theoretical capital. Let's use the capitalPerTrade for consistency.
          // This is a simplification, as actual capital deployed changes with dynamic hedge ratio.
          // A more precise ROI would track equity curve.
          const theoreticalCapital = capitalPerTrade // Using a fixed capital for ROI calculation
          const currentROI = (currentPnL / theoreticalCapital) * 100

          // Check exit conditions in priority order
          let shouldExit = false
          let exitReason = ""

          // 1. Stop Loss Check
          if (currentROI <= lossStopPercent) {
            shouldExit = true
            exitReason = "Stop Loss"
          }
          // 2. Target Profit Check
          else if (currentROI >= targetProfitPercent) {
            shouldExit = true
            exitReason = "Target Hit"
          }
          // 3. Time Stop Check
          else if (holdingPeriod >= timeStopDays) {
            shouldExit = true
            exitReason = "Time Stop"
          }
          // 4. Z-score Exit Check
          else if (
            (openTrade.type === "LONG" && prevZ < -exitZ && currZ >= -exitZ) ||
            (openTrade.type === "SHORT" && prevZ > exitZ && currZ <= exitZ)
          ) {
            shouldExit = true
            exitReason = "Z-Score Exit"
          }

          if (shouldExit) {
            // Final P&L and ROI for the trade
            let finalPnL, finalROI
            if (openTrade.type === "LONG") {
              finalPnL = currentRow.spread - openTrade.entrySpread
            } else {
              finalPnL = openTrade.entrySpread - currentRow.spread
            }
            finalROI = (finalPnL / theoreticalCapital) * 100

            cumulativePnl += finalPnL // Update cumulative P&L

            trades.push({
              entryDate: openTrade.entryDate,
              exitDate: currentRow.date,
              type: openTrade.type,
              holdingPeriod: holdingPeriod.toString(),
              pnl: finalPnL.toFixed(2),
              roi: finalROI.toFixed(2),
              exitReason: exitReason,
              entryHedgeRatio: openTrade.entryHedgeRatio.toFixed(4),
              exitHedgeRatio: currentHedgeRatio.toFixed(4),
              hedgeRatioChange: (
                ((currentHedgeRatio - openTrade.entryHedgeRatio) / openTrade.entryHedgeRatio) *
                100
              ).toFixed(2),
              entryZScore: openTrade.entryZScore.toFixed(2),
              exitZScore: currZ.toFixed(2),
              // For Kalman, shares are dynamic, so we don't track fixed shares
              stockAShares: "N/A",
              stockBShares: "N/A",
              entryStockAPrice: openTrade.entryStockAPrice.toFixed(2),
              exitStockAPrice: currentRow.stockAClose.toFixed(2),
              entryStockBPrice: openTrade.entryStockBPrice.toFixed(2),
              exitStockBPrice: currentRow.stockBClose.toFixed(2),
              theoreticalCapital: theoreticalCapital.toFixed(2),
            })

            openTrade = null
          }
        }
        // Always add the current cumulative P&L to the equity curve data
        tempEquityCurveData.push({ date: currentRow.date, cumulativePnl: cumulativePnl })
      }

      setTradeResults(trades)
      setEquityCurveData(tempEquityCurveData)
    } catch (error) {
      console.error("Error in backtest:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate comprehensive metrics
  const metrics = calculateAdvancedMetrics(tradeResults)

  // Calculate summary statistics
  const profitableTrades = tradeResults.filter((t) => Number.parseFloat(t.pnl) > 0).length
  const winRate = tradeResults.length > 0 ? (profitableTrades / tradeResults.length) * 100 : 0
  const totalProfit = tradeResults.reduce((sum, trade) => sum + Number.parseFloat(trade.pnl), 0)
  const avgProfit = tradeResults.length > 0 ? totalProfit / tradeResults.length : 0

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-bold text-white">Pair Trading Backtest</h1>
        <p className="text-xl text-gray-300">Kalman Filter Spread Model</p>
      </div>

      <div className="card">
        <h2 className="text-2xl font-bold text-white mb-6">Backtest Parameters</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 mb-8">
          <div>
            <label className="block text-base font-medium text-gray-300 mb-2">Kalman Process Noise</label>
            <input
              type="number"
              value={kalmanProcessNoise}
              onChange={(e) => setKalmanProcessNoise(Number.parseFloat(e.target.value))}
              min="0.00001"
              max="0.01"
              step="0.00001"
              className="input-field"
            />
            <p className="mt-1 text-sm text-gray-400">Controls adaptation speed of Kalman filter</p>
          </div>
          <div>
            <label className="block text-base font-medium text-gray-300 mb-2">Kalman Initial Lookback</label>
            <input
              type="number"
              value={kalmanInitialLookback}
              onChange={(e) => setKalmanInitialLookback(Number.parseInt(e.target.value))}
              min="30"
              max="120"
              className="input-field"
            />
            <p className="mt-1 text-sm text-gray-400">Days for initial OLS regression</p>
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
            <label className="block text-base font-medium text-gray-300 mb-2">Entry Z-score</label>
            <input
              type="number"
              step="0.1"
              value={entryZ}
              onChange={(e) => setEntryZ(Number.parseFloat(e.target.value))}
              className="input-field"
            />
            <p className="mt-1 text-sm text-gray-400">Z-score to enter into long/short trade</p>
          </div>
          <div>
            <label className="block text-base font-medium text-gray-300 mb-2">Exit Z-score</label>
            <input
              type="number"
              step="0.1"
              value={exitZ}
              onChange={(e) => setExitZ(Number.parseFloat(e.target.value))}
              className="input-field"
            />
            <p className="mt-1 text-sm text-gray-400">Z-score to exit from a trade position</p>
          </div>
        </div>

        {/* Stop Loss & Target Section */}
        <div className="mb-8">
          <h3 className="text-lg font-bold text-white mb-4">Stop Loss & Target</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <label className="block text-base font-medium text-gray-300 mb-2">Time-Wise Stop (days)</label>
              <input
                type="number"
                value={timeStopDays}
                onChange={(e) => setTimeStopDays(Number.parseInt(e.target.value))}
                min="1"
                max="100"
                className="input-field"
              />
              <p className="mt-1 text-sm text-gray-400">Force exit after X days regardless of Z-score</p>
            </div>
            <div>
              <label className="block text-base font-medium text-gray-300 mb-2">Loss Stop (%)</label>
              <input
                type="number"
                step="0.1"
                value={lossStopPercent}
                onChange={(e) => setLossStopPercent(Number.parseFloat(e.target.value))}
                max="0"
                className="input-field"
              />
              <p className="mt-1 text-sm text-gray-400">Exit when ROI hits this loss percentage</p>
            </div>
            <div>
              <label className="block text-base font-medium text-gray-300 mb-2">Target Profit (%)</label>
              <input
                type="number"
                step="0.1"
                value={targetProfitPercent}
                onChange={(e) => setTargetProfitPercent(Number.parseFloat(e.target.value))}
                min="0"
                className="input-field"
              />
              <p className="mt-1 text-sm text-gray-400">Exit when ROI hits this profit percentage</p>
            </div>
          </div>
        </div>

        <div className="flex justify-center mt-8">
          <button onClick={runBacktest} disabled={isLoading} className="btn-primary">
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
                Processing...
              </span>
            ) : (
              "Run Backtest"
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

      {backtestData.length > 0 && !isLoading && (
        <div className="card">
          <h2 className="text-2xl font-bold text-white mb-4">Backtest Data</h2>
          <div className="overflow-x-auto">
            <div className="max-h-64 overflow-y-auto">
              <table className="min-w-full divide-y divide-navy-700">
                <thead className="bg-navy-800 sticky top-0">
                  <tr>
                    <th className="table-header">Date</th>
                    <th className="table-header">{selectedPair.stockA} Close</th>
                    <th className="table-header">{selectedPair.stockB} Close</th>
                    <th className="table-header">Alpha (α)</th>
                    <th className="table-header">Hedge Ratio (β)</th>
                    <th className="table-header">Spread (A - α - βB)</th>
                    <th className="table-header">Z-score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800">
                  {backtestData.map((row, index) => (
                    <tr key={index} className={index % 2 === 0 ? "bg-navy-900/50" : "bg-navy-900/30"}>
                      <td className="table-cell">{row.date}</td>
                      <td className="table-cell">{row.stockAClose.toFixed(2)}</td>
                      <td className="table-cell">{row.stockBClose.toFixed(2)}</td>
                      <td className="table-cell">{row.alpha.toFixed(4)}</td>
                      <td className="table-cell">{row.hedgeRatio.toFixed(4)}</td>
                      <td className="table-cell">{row.spread.toFixed(4)}</td>
                      <td
                        className={`table-cell font-medium ${
                          row.zScore > entryZ || row.zScore < -entryZ
                            ? "text-gold-400"
                            : row.zScore > exitZ || row.zScore < -exitZ
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
      )}

      {tradeResults.length > 0 && !isLoading && (
        <>
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white">Trade Results</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-navy-700">
                <thead className="bg-navy-800">
                  <tr>
                    <th className="table-header">Entry Date</th>
                    <th className="table-header">Exit Date</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">Days</th>
                    <th className="table-header">P&L ($)</th>
                    <th className="table-header">ROI (%)</th>
                    <th className="table-header">Exit Reason</th>
                    <th className="table-header">Entry β</th>
                    <th className="table-header">Exit β</th>
                    <th className="table-header">β Change (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800">
                  {tradeResults.map((trade, index) => (
                    <tr key={index} className={index % 2 === 0 ? "bg-navy-900/50" : "bg-navy-900/30"}>
                      <td className="table-cell">{trade.entryDate}</td>
                      <td className="table-cell">{trade.exitDate}</td>
                      <td
                        className={`table-cell font-medium ${trade.type === "LONG" ? "text-green-400" : "text-red-400"}`}
                      >
                        {trade.type}
                      </td>
                      <td className="table-cell">{trade.holdingPeriod}</td>
                      <td
                        className={`table-cell font-medium ${
                          Number.parseFloat(trade.pnl) >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        ${trade.pnl}
                      </td>
                      <td
                        className={`table-cell ${
                          Number.parseFloat(trade.roi) >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {trade.roi}%
                      </td>
                      <td
                        className={`table-cell font-medium ${
                          trade.exitReason === "Stop Loss"
                            ? "text-red-400"
                            : trade.exitReason === "Target Hit"
                              ? "text-green-400"
                              : trade.exitReason === "Time Stop"
                                ? "text-yellow-400"
                                : "text-blue-400"
                        }`}
                      >
                        {trade.exitReason}
                      </td>
                      <td className="table-cell">{trade.entryHedgeRatio}</td>
                      <td className="table-cell">{trade.exitHedgeRatio}</td>
                      <td
                        className={`table-cell ${
                          Number.parseFloat(trade.hedgeRatioChange) >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {trade.hedgeRatioChange}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Equity Curve Chart */}
          {equityCurveData.length > 1 && (
            <div className="card">
              <h2 className="text-2xl font-bold text-white mb-4">Equity Curve</h2>
              <p className="text-gray-300 mb-6">Cumulative P&L over time</p>
              <ChartContainer
                config={{
                  cumulativePnl: {
                    label: "Cumulative P&L",
                    color: "hsl(47.9 95.8% 53.1%)", // Gold/Yellow
                  },
                }}
                className="h-[300px] w-full [&_.recharts-cartesian-axis-tick_text]:fill-white bg-navy-800/50 rounded-lg p-3 border border-navy-700" // Added styling here
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={equityCurveData}
                    margin={{
                      left: 12,
                      right: 12,
                    }}
                  >
                    <CartesianGrid vertical={false} stroke="#4B5563" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tickFormatter={(value) => new Date(value).toLocaleDateString()}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tickFormatter={(value) => `$${value.toFixed(0)}`}
                    />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Area
                      dataKey="cumulativePnl"
                      type="monotone"
                      fill="url(#fillCumulativePnl)"
                      stroke="hsl(47.9 95.8% 53.1%)" // Gold/Yellow
                      strokeWidth={2}
                    />
                    <defs>
                      <linearGradient id="fillCumulativePnl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(47.9 95.8% 53.1%)" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="hsl(47.9 95.8% 53.1%)" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          )}

          {/* Comprehensive Performance Metrics */}
          <div className="card">
            <h3 className="text-xl font-bold text-white mb-4">Kalman Filter Position Performance</h3>

            {/* Overall Performance */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gold-400 mb-3">Overall Performance</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Total Trades</p>
                  <p className="text-xl font-bold text-gold-400">{tradeResults.length}</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Win Rate</p>
                  <p className="text-xl font-bold text-green-400">{winRate.toFixed(1)}%</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Total P&L</p>
                  <p className={`text-xl font-bold ${totalProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                    ${totalProfit.toFixed(2)}
                  </p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Avg P&L</p>
                  <p className={`text-xl font-bold ${avgProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                    ${avgProfit.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Directional Analysis */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gold-400 mb-3">Directional Analysis</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Long Spread Trades</p>
                  <p className="text-xl font-bold text-blue-400">{metrics.longTrades || 0}</p>
                  <p className="text-sm text-gray-400">Win Rate: {(metrics.longWinRate || 0).toFixed(1)}%</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Short Spread Trades</p>
                  <p className="text-xl font-bold text-red-400">{metrics.shortTrades || 0}</p>
                  <p className="text-sm text-gray-400">Win Rate: {(metrics.shortWinRate || 0).toFixed(1)}%</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Avg Long Win</p>
                  <p className="text-xl font-bold text-green-400">${(metrics.avgLongWin || 0).toFixed(2)}</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Avg Short Win</p>
                  <p className="text-xl font-bold text-green-400">${(metrics.avgShortWin || 0).toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Risk Metrics */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gold-400 mb-3">Risk Metrics</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Sharpe Ratio</p>
                  <p className="text-xl font-bold text-purple-400">{(metrics.sharpeRatio || 0).toFixed(3)}</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Max Drawdown</p>
                  <p className="text-xl font-bold text-red-400">${(metrics.maxDrawdown || 0).toFixed(2)}</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Profit Factor</p>
                  <p className="text-xl font-bold text-gold-400">{(metrics.profitFactor || 0).toFixed(2)}</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Expectancy</p>
                  <p
                    className={`text-xl font-bold ${(metrics.expectancy || 0) >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    ${(metrics.expectancy || 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Additional Metrics */}
            <div>
              <h4 className="text-lg font-semibold text-gold-400 mb-3">Additional Metrics</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Best Trade</p>
                  <p className="text-xl font-bold text-green-400">${(metrics.bestTrade || 0).toFixed(2)}</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Worst Trade</p>
                  <p className="text-xl font-bold text-red-400">${(metrics.worstTrade || 0).toFixed(2)}</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Max Consecutive Wins</p>
                  <p className="text-xl font-bold text-green-400">{metrics.maxConsecutiveWins || 0}</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Max Consecutive Losses</p>
                  <p className="text-xl font-bold text-red-400">{metrics.maxConsecutiveLosses || 0}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
