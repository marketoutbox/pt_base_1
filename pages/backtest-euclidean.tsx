"use client"

import { useState, useEffect } from "react"
import { openDB } from "idb"
import calculateZScore from "../utils/calculations" // Assuming this calculates Z-score for an array
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

export default function BacktestEuclidean() {
  const [stocks, setStocks] = useState([])
  const [selectedPair, setSelectedPair] = useState({ stockA: "", stockB: "" })
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [lookbackPeriod, setLookbackPeriod] = useState(60) // For rolling mean/std of distance
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
    const longTrades = trades.filter((t) => t.type === "LONG_A_SHORT_B")
    const shortTrades = trades.filter((t) => t.type === "SHORT_A_LONG_B")

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

      if (minLength < lookbackPeriod) {
        alert(`Insufficient data. Need at least ${lookbackPeriod} days for lookback, but only have ${minLength} days.`)
        setIsLoading(false)
        return
      }

      // Step 2: Price Normalization
      const initialPriceA = alignedPricesA[0].close
      const initialPriceB = alignedPricesB[0].close

      const normalizedData = alignedPricesA.map((item, index) => {
        const normalizedA = item.close / initialPriceA
        const normalizedB = alignedPricesB[index].close / initialPriceB
        return {
          date: item.date,
          stockAClose: item.close,
          stockBClose: alignedPricesB[index].close,
          normalizedA,
          normalizedB,
          distance: Math.abs(normalizedA - normalizedB), // Step 3: Euclidean Distance
        }
      })

      // Step 4 & 5: Rolling Mean, Std Dev, and Z-score for Distance
      const distances = normalizedData.map((d) => d.distance)
      const zScores = []

      for (let i = 0; i < distances.length; i++) {
        if (i < lookbackPeriod - 1) {
          zScores.push(0) // Not enough data for rolling Z-score
          continue
        }
        const windowDistances = distances.slice(i - lookbackPeriod + 1, i + 1)
        // calculateZScore returns an array of z-scores for the input array. We need the last one.
        const currentZScore = calculateZScore(windowDistances).pop()
        zScores.push(currentZScore)
      }

      const tableData = normalizedData.map((item, index) => ({
        ...item,
        zScore: zScores[index] || 0,
      }))

      setBacktestData(tableData)

      // Backtest logic
      const trades = []
      let openTrade = null
      let cumulativePnl = 0
      const tempEquityCurveData = [{ date: fromDate, cumulativePnl: 0 }] // Initialize equity curve

      for (let i = lookbackPeriod; i < tableData.length; i++) {
        const prevZ = tableData[i - 1].zScore
        const currZ = tableData[i].zScore
        const currentRow = tableData[i]

        if (!openTrade) {
          // Entry conditions: Z-score crosses the entry threshold (divergence)
          if (Math.abs(prevZ) < entryZ && Math.abs(currZ) >= entryZ) {
            let tradeType = ""
            if (currentRow.normalizedA > currentRow.normalizedB) {
              // A is relatively high, B is relatively low -> Short A, Long B
              tradeType = "SHORT_A_LONG_B"
            } else {
              // B is relatively high, A is relatively low -> Long A, Short B
              tradeType = "LONG_A_SHORT_B"
            }

            openTrade = {
              entryDate: currentRow.date,
              entryIndex: i,
              type: tradeType,
              entryZScore: currZ,
              entryDistance: currentRow.distance,
              entryStockAPrice: currentRow.stockAClose,
              entryStockBPrice: currentRow.stockBClose,
            }
          }
        } else {
          const entryDate = new Date(openTrade.entryDate)
          const currentDate = new Date(currentRow.date)
          const holdingPeriod = Math.floor((currentDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))

          // Calculate current P&L for value-neutral position
          const capitalPerLeg = capitalPerTrade / 2
          const sharesA = capitalPerLeg / openTrade.entryStockAPrice
          const sharesB = capitalPerLeg / openTrade.entryStockBPrice

          let currentPnL
          if (openTrade.type === "SHORT_A_LONG_B") {
            // Short A, Long B: Profit if A falls, B rises (or A falls more than B, or B rises more than A)
            currentPnL =
              sharesA * (openTrade.entryStockAPrice - currentRow.stockAClose) +
              sharesB * (currentRow.stockBClose - openTrade.entryStockBPrice)
          } else {
            // Long A, Short B: Profit if A rises, B falls (or A rises more than B, or B falls more than A)
            currentPnL =
              sharesA * (currentRow.stockAClose - openTrade.entryStockAPrice) +
              sharesB * (openTrade.entryStockBPrice - currentRow.stockBClose)
          }
          const currentROI = (currentPnL / capitalPerTrade) * 100

          // Exit conditions (priority order: Stop Loss > Target > Time > Z-Score)
          let exitReason = ""
          let shouldExit = false

          if (currentROI <= lossStopPercent) {
            exitReason = "Stop Loss"
            shouldExit = true
          } else if (currentROI >= targetProfitPercent) {
            exitReason = "Target Profit"
            shouldExit = true
          } else if (holdingPeriod >= timeStopDays) {
            exitReason = "Time Stop"
            shouldExit = true
          } else if (Math.abs(currZ) <= exitZ) {
            // Exit when distance converges back to mean (Z-score approaches 0)
            exitReason = "Z-Score Exit"
            shouldExit = true
          }

          if (shouldExit) {
            // Final P&L and ROI for the trade
            let finalPnL
            if (openTrade.type === "SHORT_A_LONG_B") {
              finalPnL =
                sharesA * (openTrade.entryStockAPrice - currentRow.stockAClose) +
                sharesB * (currentRow.stockBClose - openTrade.entryStockBPrice)
            } else {
              finalPnL =
                sharesA * (currentRow.stockAClose - openTrade.entryStockAPrice) +
                sharesB * (openTrade.entryStockBPrice - currentRow.stockBClose)
            }
            const finalROI = (finalPnL / capitalPerTrade) * 100

            cumulativePnl += finalPnL // Update cumulative P&L

            trades.push({
              entryDate: openTrade.entryDate,
              exitDate: currentRow.date,
              type: openTrade.type,
              holdingPeriod: holdingPeriod.toString(),
              pnl: finalPnL.toFixed(2),
              roi: finalROI.toFixed(2),
              exitReason: exitReason,
              entryZScore: openTrade.entryZScore.toFixed(2),
              exitZScore: currZ.toFixed(2),
              entryDistance: openTrade.entryDistance.toFixed(4),
              exitDistance: currentRow.distance.toFixed(4),
              stockAShares: sharesA.toFixed(2),
              stockBShares: sharesB.toFixed(2),
              entryStockAPrice: openTrade.entryStockAPrice.toFixed(2),
              exitStockAPrice: currentRow.stockAClose.toFixed(2),
              entryStockBPrice: openTrade.entryStockBPrice.toFixed(2),
              exitStockBPrice: currentRow.stockBClose.toFixed(2),
              theoreticalCapital: capitalPerTrade.toFixed(2),
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
        <p className="text-xl text-gray-300">Euclidean Distance Model</p>
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <label className="block text-base font-medium text-gray-300 mb-2">Lookback Period (Days)</label>
            <input
              type="number"
              value={lookbackPeriod}
              onChange={(e) => setLookbackPeriod(Number.parseInt(e.target.value))}
              min="10"
              max="252"
              className="input-field"
            />
            <p className="mt-1 text-sm text-gray-400">Window size for rolling distance Z-score</p>
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
            <p className="mt-1 text-sm text-gray-400">Absolute Z-score to enter trade (divergence)</p>
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
            <p className="mt-1 text-sm text-gray-400">Absolute Z-score to exit trade (convergence)</p>
          </div>
          <div>
            <label className="block text-base font-medium text-gray-300 mb-2">Capital Per Trade ($)</label>
            <input
              type="number"
              value={capitalPerTrade}
              onChange={(e) => setCapitalPerTrade(Number.parseInt(e.target.value))}
              min="1000"
              step="1000"
              className="input-field"
            />
            <p className="mt-1 text-sm text-gray-400">Amount for value-neutral calculation</p>
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
                    <th className="table-header">Normalized {selectedPair.stockA}</th>
                    <th className="table-header">Normalized {selectedPair.stockB}</th>
                    <th className="table-header">Distance</th>
                    <th className="table-header">Z-score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800">
                  {backtestData.map((row, index) => (
                    <tr key={index} className={index % 2 === 0 ? "bg-navy-900/50" : "bg-navy-900/30"}>
                      <td className="table-cell">{row.date}</td>
                      <td className="table-cell">{row.stockAClose.toFixed(2)}</td>
                      <td className="table-cell">{row.stockBClose.toFixed(2)}</td>
                      <td className="table-cell">{row.normalizedA.toFixed(4)}</td>
                      <td className="table-cell">{row.normalizedB.toFixed(4)}</td>
                      <td className="table-cell">{row.distance.toFixed(4)}</td>
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
                    <th className="table-header">Entry Z</th>
                    <th className="table-header">Exit Z</th>
                    <th className="table-header">Entry Dist</th>
                    <th className="table-header">Exit Dist</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800">
                  {tradeResults.map((trade, index) => (
                    <tr key={index} className={index % 2 === 0 ? "bg-navy-900/50" : "bg-navy-900/30"}>
                      <td className="table-cell">{trade.entryDate}</td>
                      <td className="table-cell">{trade.exitDate}</td>
                      <td
                        className={`table-cell font-medium ${
                          trade.type === "LONG_A_SHORT_B" ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {trade.type === "LONG_A_SHORT_B" ? "Long A / Short B" : "Short A / Long B"}
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
                            : trade.exitReason === "Target Profit"
                              ? "text-green-400"
                              : trade.exitReason === "Time Stop"
                                ? "text-yellow-400"
                                : "text-blue-400"
                        }`}
                      >
                        {trade.exitReason}
                      </td>
                      <td className="table-cell">{trade.entryZScore}</td>
                      <td className="table-cell">{trade.exitZScore}</td>
                      <td className="table-cell">{trade.entryDistance}</td>
                      <td className="table-cell">{trade.exitDistance}</td>
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
                className="h-[300px] w-full [&_.recharts-cartesian-axis-tick_text]:fill-white bg-navy-800/50 rounded-lg p-3 border border-navy-700"
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
            <h3 className="text-xl font-bold text-white mb-4">Euclidean Distance Position Performance</h3>

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
                  <p className="text-sm text-gray-300">Long A / Short B Trades</p>
                  <p className="text-xl font-bold text-blue-400">{metrics.longTrades || 0}</p>
                  <p className="text-sm text-gray-400">Win Rate: {(metrics.longWinRate || 0).toFixed(1)}%</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Short A / Long B Trades</p>
                  <p className="text-xl font-bold text-red-400">{metrics.shortTrades || 0}</p>
                  <p className="text-sm text-gray-400">Win Rate: {(metrics.shortWinRate || 0).toFixed(1)}%</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Avg Long A / Short B Win</p>
                  <p className="text-xl font-bold text-green-400">${(metrics.avgLongWin || 0).toFixed(2)}</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                  <p className="text-sm text-gray-300">Avg Short A / Long B Win</p>
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
