"use client"

import { useState, useEffect } from "react"
import { openDB } from "idb"

export default function BacktestSpread() {
  const [stocks, setStocks] = useState([])
  const [selectedPair, setSelectedPair] = useState({ stockA: "", stockB: "" })
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [entryZ, setEntryZ] = useState(2.0)
  const [exitZ, setExitZ] = useState(1.5)
  const [backtestData, setBacktestData] = useState([])
  const [hedgedTradeResults, setHedgedTradeResults] = useState([])
  const [valueNeutralTradeResults, setValueNeutralTradeResults] = useState([])
  const [lookbackPeriod, setLookbackPeriod] = useState(50)
  const [isLoading, setIsLoading] = useState(false)
  const [capitalPerTrade, setCapitalPerTrade] = useState(100000)
  const [riskFreeRate, setRiskFreeRate] = useState(0.02) // 2% annual risk-free rate
  const [activeTab, setActiveTab] = useState("hedged") // "hedged" or "valueNeutral"

  // Stop Loss & Target Parameters
  const [timeStopDays, setTimeStopDays] = useState(15)
  const [lossStopPercent, setLossStopPercent] = useState(-10)
  const [targetProfitPercent, setTargetProfitPercent] = useState(10)

  useEffect(() => {
    const fetchStocks = async () => {
      try {
        // Use the getDB function from indexedDB.js instead of directly opening the database
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
    if (count === 0 || count * sumB2 - sumB * sumB === 0) return 1

    return (count * sumAB - sumA * sumB) / (count * sumB2 - sumB * sumB)
  }

  const calculateAdvancedMetrics = (trades, method = "hedged") => {
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

  const runBacktestForMethod = (tableData, method) => {
    const trades = []
    let openTrade = null

    for (let i = lookbackPeriod; i < tableData.length; i++) {
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
            entryZScore: currZ,
            entryStockAPrice: currentRow.stockAClose,
            entryStockBPrice: currentRow.stockBClose,
          }
        }
      } else {
        // Calculate current P&L and ROI for the specific method
        const entryDate = new Date(openTrade.entryDate)
        const currentDate = new Date(currentRow.date)
        const holdingPeriod = Math.floor((currentDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))

        let currentPnL,
          currentROI,
          exitReason = ""

        if (method === "hedged") {
          // Hedge Factor Adjusted calculation
          const hedgeRatio = openTrade.entryHedgeRatio
          if (openTrade.type === "LONG") {
            currentPnL =
              currentRow.stockAClose -
              openTrade.entryStockAPrice -
              hedgeRatio * (currentRow.stockBClose - openTrade.entryStockBPrice)
          } else {
            currentPnL =
              openTrade.entryStockAPrice -
              currentRow.stockAClose -
              hedgeRatio * (openTrade.entryStockBPrice - currentRow.stockBClose)
          }
          const theoreticalCapital = openTrade.entryStockAPrice + hedgeRatio * openTrade.entryStockBPrice
          currentROI = (currentPnL / theoreticalCapital) * 100
        } else {
          // Value Neutral calculation
          const capitalPerLeg = capitalPerTrade / 2
          const stockAShares = Math.floor(capitalPerLeg / openTrade.entryStockAPrice)
          const stockBShares = Math.floor(capitalPerLeg / openTrade.entryStockBPrice)

          let stockAPnL, stockBPnL
          if (openTrade.type === "LONG") {
            stockAPnL = stockAShares * (currentRow.stockAClose - openTrade.entryStockAPrice)
            stockBPnL = stockBShares * (openTrade.entryStockBPrice - currentRow.stockBClose)
          } else {
            stockAPnL = stockAShares * (openTrade.entryStockAPrice - currentRow.stockAClose)
            stockBPnL = stockBShares * (currentRow.stockBClose - openTrade.entryStockBPrice)
          }
          currentPnL = stockAPnL + stockBPnL
          currentROI = (currentPnL / capitalPerTrade) * 100
        }

        // Check exit conditions in priority order
        let shouldExit = false

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
          const currentHedgeRatio = currentRow.hedgeRatio

          // Calculate final P&L and additional metrics for the trade
          let finalPnL,
            finalROI,
            stockAShares = 0,
            stockBShares = 0,
            theoreticalCapital = 0

          if (method === "hedged") {
            const hedgeRatio = openTrade.entryHedgeRatio
            if (openTrade.type === "LONG") {
              finalPnL =
                currentRow.stockAClose -
                openTrade.entryStockAPrice -
                hedgeRatio * (currentRow.stockBClose - openTrade.entryStockBPrice)
            } else {
              finalPnL =
                openTrade.entryStockAPrice -
                currentRow.stockAClose -
                hedgeRatio * (openTrade.entryStockBPrice - currentRow.stockBClose)
            }
            theoreticalCapital = openTrade.entryStockAPrice + hedgeRatio * openTrade.entryStockBPrice
            finalROI = (finalPnL / theoreticalCapital) * 100
          } else {
            const capitalPerLeg = capitalPerTrade / 2
            stockAShares = Math.floor(capitalPerLeg / openTrade.entryStockAPrice)
            stockBShares = Math.floor(capitalPerLeg / openTrade.entryStockBPrice)

            let stockAPnL, stockBPnL
            if (openTrade.type === "LONG") {
              stockAPnL = stockAShares * (currentRow.stockAClose - openTrade.entryStockAPrice)
              stockBPnL = stockBShares * (openTrade.entryStockBPrice - currentRow.stockBClose)
            } else {
              stockAPnL = stockAShares * (openTrade.entryStockAPrice - currentRow.stockAClose)
              stockBPnL = stockBShares * (currentRow.stockBClose - openTrade.entryStockBPrice)
            }
            finalPnL = stockAPnL + stockBPnL
            finalROI = (finalPnL / capitalPerTrade) * 100
          }

          trades.push({
            entryDate: openTrade.entryDate,
            exitDate: currentRow.date,
            type: openTrade.type,
            holdingPeriod: holdingPeriod.toString(),
            pnl: finalPnL.toFixed(2),
            roi: finalROI.toFixed(2),
            exitReason: exitReason,
            hedgeRatio: openTrade.entryHedgeRatio.toFixed(4),
            exitHedgeRatio: currentHedgeRatio.toFixed(4),
            hedgeRatioChange: (
              ((currentHedgeRatio - openTrade.entryHedgeRatio) / openTrade.entryHedgeRatio) *
              100
            ).toFixed(2),
            entryZScore: openTrade.entryZScore.toFixed(2),
            exitZScore: currZ.toFixed(2),
            stockAShares: stockAShares,
            stockBShares: stockBShares,
            entryStockAPrice: openTrade.entryStockAPrice.toFixed(2),
            exitStockAPrice: currentRow.stockAClose.toFixed(2),
            entryStockBPrice: openTrade.entryStockBPrice.toFixed(2),
            exitStockBPrice: currentRow.stockBClose.toFixed(2),
            theoreticalCapital: theoreticalCapital.toFixed(2),
          })

          openTrade = null
        }
      }
    }

    return trades
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
        alert(`Insufficient data. Need at least ${lookbackPeriod} days, but only have ${minLength} days.`)
        setIsLoading(false)
        return
      }

      const spreads = []
      const hedgeRatios = []

      // Calculate rolling hedge ratios and spreads
      for (let i = 0; i < minLength; i++) {
        const currentHedgeRatio = calculateHedgeRatio(alignedPricesA, alignedPricesB, i, lookbackPeriod)
        hedgeRatios.push(currentHedgeRatio)

        spreads.push({
          date: alignedPricesA[i].date,
          spread: alignedPricesA[i].close - currentHedgeRatio * alignedPricesB[i].close,
          stockAClose: alignedPricesA[i].close,
          stockBClose: alignedPricesB[i].close,
          hedgeRatio: currentHedgeRatio,
          index: i,
        })
      }

      // Calculate z-scores using the corrected methodology
      const zScores = []
      for (let i = 0; i < spreads.length; i++) {
        if (i < lookbackPeriod - 1) {
          zScores.push(0) // Not enough data for z-score
          continue
        }

        // Get the current regression parameters
        const currentAlpha = spreads[i].stockAClose - spreads[i].hedgeRatio * spreads[i].stockBClose - spreads[i].spread
        const currentBeta = spreads[i].hedgeRatio

        // Calculate window spreads using current alpha/beta
        const windowStart = Math.max(0, i - lookbackPeriod + 1)
        const windowSpreads = []

        for (let j = windowStart; j <= i; j++) {
          const windowSpread = spreads[j].stockAClose - (currentAlpha + currentBeta * spreads[j].stockBClose)
          windowSpreads.push(windowSpread)
        }

        // Calculate z-score using sample standard deviation
        const mean = windowSpreads.reduce((sum, val) => sum + val, 0) / windowSpreads.length
        const variance =
          windowSpreads.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (windowSpreads.length - 1)
        const stdDev = Math.sqrt(variance)

        const currentSpread = spreads[i].spread
        const zScore = stdDev > 0 ? (currentSpread - mean) / stdDev : 0
        zScores.push(zScore)
      }

      const tableData = spreads.map((item, index) => ({
        date: item.date,
        stockAClose: item.stockAClose,
        stockBClose: item.stockBClose,
        spread: item.spread,
        zScore: zScores[index] || 0,
        hedgeRatio: item.hedgeRatio,
        index: index,
      }))

      setBacktestData(tableData)

      // Run backtest for both methods
      const hedgedTrades = runBacktestForMethod(tableData, "hedged")
      const valueNeutralTrades = runBacktestForMethod(tableData, "valueNeutral")

      setHedgedTradeResults(hedgedTrades)
      setValueNeutralTradeResults(valueNeutralTrades)
    } catch (error) {
      console.error("Error in backtest:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate comprehensive metrics for both methods
  const hedgedMetrics = calculateAdvancedMetrics(hedgedTradeResults, "hedged")
  const valueNeutralMetrics = calculateAdvancedMetrics(valueNeutralTradeResults, "valueNeutral")

  // Get current trade results based on active tab
  const currentTradeResults = activeTab === "hedged" ? hedgedTradeResults : valueNeutralTradeResults

  // Calculate summary statistics for both methods
  const profitableHedgedTrades = hedgedTradeResults.filter((t) => Number.parseFloat(t.pnl) > 0).length
  const profitableValueNeutralTrades = valueNeutralTradeResults.filter((t) => Number.parseFloat(t.pnl) > 0).length

  const winRateHedged = hedgedTradeResults.length > 0 ? (profitableHedgedTrades / hedgedTradeResults.length) * 100 : 0
  const winRateValueNeutral =
    valueNeutralTradeResults.length > 0 ? (profitableValueNeutralTrades / valueNeutralTradeResults.length) * 100 : 0

  const totalHedgedProfit = hedgedTradeResults.reduce((sum, trade) => sum + Number.parseFloat(trade.pnl), 0)
  const totalValueNeutralProfit = valueNeutralTradeResults.reduce((sum, trade) => sum + Number.parseFloat(trade.pnl), 0)

  const avgHedgedProfit = hedgedTradeResults.length > 0 ? totalHedgedProfit / hedgedTradeResults.length : 0
  const avgValueNeutralProfit =
    valueNeutralTradeResults.length > 0 ? totalValueNeutralProfit / valueNeutralTradeResults.length : 0

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-bold text-white">Pair Trading Backtest</h1>
        <p className="text-xl text-gray-300">Dynamic Spread Model</p>
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
            <label className="block text-base font-medium text-gray-300 mb-2">Lookback Period (days)</label>
            <input
              type="number"
              value={lookbackPeriod}
              onChange={(e) => setLookbackPeriod(Number.parseInt(e.target.value))}
              min="10"
              max="252"
              className="input-field"
            />
            <p className="mt-1 text-sm text-gray-400">Window size for calculating hedge ratio and z-score</p>
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
          <div>
            <label className="block text-base font-medium text-gray-300 mb-2">Risk-Free Rate (%)</label>
            <input
              type="number"
              step="0.01"
              value={riskFreeRate * 100}
              onChange={(e) => setRiskFreeRate(Number.parseFloat(e.target.value) / 100)}
              className="input-field"
            />
            <p className="mt-1 text-sm text-gray-400">Annual risk-free rate for Sharpe ratio</p>
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
                    <th className="table-header">Hedge Ratio (β)</th>
                    <th className="table-header">Spread (A - βB)</th>
                    <th className="table-header">Z-score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800">
                  {backtestData.map((row, index) => (
                    <tr key={index} className={index % 2 === 0 ? "bg-navy-900/50" : "bg-navy-900/30"}>
                      <td className="table-cell">{row.date}</td>
                      <td className="table-cell">{row.stockAClose.toFixed(2)}</td>
                      <td className="table-cell">{row.stockBClose.toFixed(2)}</td>
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

      {(hedgedTradeResults.length > 0 || valueNeutralTradeResults.length > 0) && !isLoading && (
        <>
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white">Trade Results</h2>

              {/* Tab Buttons */}
              <div className="flex space-x-2">
                <button
                  onClick={() => setActiveTab("hedged")}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === "hedged" ? "bg-gold-500 text-navy-900" : "bg-navy-700 text-gray-300 hover:bg-navy-600"
                  }`}
                >
                  Hedge Factor Adj Position ({hedgedTradeResults.length} trades)
                </button>
                <button
                  onClick={() => setActiveTab("valueNeutral")}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === "valueNeutral"
                      ? "bg-gold-500 text-navy-900"
                      : "bg-navy-700 text-gray-300 hover:bg-navy-600"
                  }`}
                >
                  Value Neutral Position ({valueNeutralTradeResults.length} trades)
                </button>
              </div>
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
                  {currentTradeResults.map((trade, index) => (
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
                      <td className="table-cell">{trade.hedgeRatio}</td>
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

          {/* Comprehensive Performance Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Hedged Position Metrics */}
            <div className="card">
              <h3 className="text-xl font-bold text-white mb-4">Hedge Factor Adj Position Performance</h3>

              {/* Overall Performance */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gold-400 mb-3">Overall Performance</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Total Trades</p>
                    <p className="text-xl font-bold text-gold-400">{hedgedTradeResults.length}</p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Win Rate</p>
                    <p className="text-xl font-bold text-green-400">{winRateHedged.toFixed(1)}%</p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Total P&L</p>
                    <p className={`text-xl font-bold ${totalHedgedProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                      ${totalHedgedProfit.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Avg P&L</p>
                    <p className={`text-xl font-bold ${avgHedgedProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                      ${avgHedgedProfit.toFixed(2)}
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
                    <p className="text-xl font-bold text-blue-400">{hedgedMetrics.longTrades || 0}</p>
                    <p className="text-sm text-gray-400">Win Rate: {(hedgedMetrics.longWinRate || 0).toFixed(1)}%</p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Short Spread Trades</p>
                    <p className="text-xl font-bold text-red-400">{hedgedMetrics.shortTrades || 0}</p>
                    <p className="text-sm text-gray-400">Win Rate: {(hedgedMetrics.shortWinRate || 0).toFixed(1)}%</p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Avg Long Win</p>
                    <p className="text-xl font-bold text-green-400">${(hedgedMetrics.avgLongWin || 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Avg Short Win</p>
                    <p className="text-xl font-bold text-green-400">${(hedgedMetrics.avgShortWin || 0).toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {/* Risk Metrics */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gold-400 mb-3">Risk Metrics</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Sharpe Ratio</p>
                    <p className="text-xl font-bold text-purple-400">{(hedgedMetrics.sharpeRatio || 0).toFixed(3)}</p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Max Drawdown</p>
                    <p className="text-xl font-bold text-red-400">${(hedgedMetrics.maxDrawdown || 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Profit Factor</p>
                    <p className="text-xl font-bold text-gold-400">{(hedgedMetrics.profitFactor || 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Expectancy</p>
                    <p
                      className={`text-xl font-bold ${(hedgedMetrics.expectancy || 0) >= 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      ${(hedgedMetrics.expectancy || 0).toFixed(2)}
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
                    <p className="text-xl font-bold text-green-400">${(hedgedMetrics.bestTrade || 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Worst Trade</p>
                    <p className="text-xl font-bold text-red-400">${(hedgedMetrics.worstTrade || 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Max Consecutive Wins</p>
                    <p className="text-xl font-bold text-green-400">{hedgedMetrics.maxConsecutiveWins || 0}</p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Max Consecutive Losses</p>
                    <p className="text-xl font-bold text-red-400">{hedgedMetrics.maxConsecutiveLosses || 0}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Value Neutral Metrics */}
            <div className="card">
              <h3 className="text-xl font-bold text-white mb-4">Value Neutral Position Performance</h3>

              {/* Overall Performance */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gold-400 mb-3">Overall Performance</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Total Trades</p>
                    <p className="text-xl font-bold text-gold-400">{valueNeutralTradeResults.length}</p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Win Rate</p>
                    <p className="text-xl font-bold text-green-400">{winRateValueNeutral.toFixed(1)}%</p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Total P&L</p>
                    <p
                      className={`text-xl font-bold ${totalValueNeutralProfit >= 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      ${totalValueNeutralProfit.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Avg P&L</p>
                    <p
                      className={`text-xl font-bold ${avgValueNeutralProfit >= 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      ${avgValueNeutralProfit.toFixed(2)}
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
                    <p className="text-xl font-bold text-blue-400">{valueNeutralMetrics.longTrades || 0}</p>
                    <p className="text-sm text-gray-400">
                      Win Rate: {(valueNeutralMetrics.longWinRate || 0).toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Short Spread Trades</p>
                    <p className="text-xl font-bold text-red-400">{valueNeutralMetrics.shortTrades || 0}</p>
                    <p className="text-sm text-gray-400">
                      Win Rate: {(valueNeutralMetrics.shortWinRate || 0).toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Avg Long Win</p>
                    <p className="text-xl font-bold text-green-400">
                      ${(valueNeutralMetrics.avgLongWin || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Avg Short Win</p>
                    <p className="text-xl font-bold text-green-400">
                      ${(valueNeutralMetrics.avgShortWin || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Risk Metrics */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gold-400 mb-3">Risk Metrics</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Sharpe Ratio</p>
                    <p className="text-xl font-bold text-purple-400">
                      {(valueNeutralMetrics.sharpeRatio || 0).toFixed(3)}
                    </p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Max Drawdown</p>
                    <p className="text-xl font-bold text-red-400">
                      ${(valueNeutralMetrics.maxDrawdown || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Profit Factor</p>
                    <p className="text-xl font-bold text-gold-400">
                      {(valueNeutralMetrics.profitFactor || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Expectancy</p>
                    <p
                      className={`text-xl font-bold ${(valueNeutralMetrics.expectancy || 0) >= 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      ${(valueNeutralMetrics.expectancy || 0).toFixed(2)}
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
                    <p className="text-xl font-bold text-green-400">
                      ${(valueNeutralMetrics.bestTrade || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Worst Trade</p>
                    <p className="text-xl font-bold text-red-400">
                      ${(valueNeutralMetrics.worstTrade || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Max Consecutive Wins</p>
                    <p className="text-xl font-bold text-green-400">{valueNeutralMetrics.maxConsecutiveWins || 0}</p>
                  </div>
                  <div className="bg-navy-800/50 rounded-lg p-3 border border-navy-700">
                    <p className="text-sm text-gray-300">Max Consecutive Losses</p>
                    <p className="text-xl font-bold text-red-400">{valueNeutralMetrics.maxConsecutiveLosses || 0}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Comparison Summary */}
          <div className="card">
            <h3 className="text-xl font-bold text-white mb-4">Method Comparison Summary</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-navy-700">
                <thead className="bg-navy-800">
                  <tr>
                    <th className="table-header">Metric</th>
                    <th className="table-header">Hedge Factor Adj Position</th>
                    <th className="table-header">Value Neutral</th>
                    <th className="table-header">Better Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800">
                  <tr className="bg-navy-900/50">
                    <td className="table-cell font-medium">Total P&L</td>
                    <td className="table-cell">${totalHedgedProfit.toFixed(2)}</td>
                    <td className="table-cell">${totalValueNeutralProfit.toFixed(2)}</td>
                    <td
                      className={`table-cell font-medium ${totalHedgedProfit > totalValueNeutralProfit ? "text-green-400" : "text-red-400"}`}
                    >
                      {totalHedgedProfit > totalValueNeutralProfit ? "Hedge Factor Adj" : "Value Neutral"}
                    </td>
                  </tr>
                  <tr className="bg-navy-900/30">
                    <td className="table-cell font-medium">Win Rate</td>
                    <td className="table-cell">{winRateHedged.toFixed(1)}%</td>
                    <td className="table-cell">{winRateValueNeutral.toFixed(1)}%</td>
                    <td
                      className={`table-cell font-medium ${winRateHedged > winRateValueNeutral ? "text-green-400" : "text-red-400"}`}
                    >
                      {winRateHedged > winRateValueNeutral ? "Hedge Factor Adj" : "Value Neutral"}
                    </td>
                  </tr>
                  <tr className="bg-navy-900/50">
                    <td className="table-cell font-medium">Sharpe Ratio</td>
                    <td className="table-cell">{(hedgedMetrics.sharpeRatio || 0).toFixed(3)}</td>
                    <td className="table-cell">{(valueNeutralMetrics.sharpeRatio || 0).toFixed(3)}</td>
                    <td
                      className={`table-cell font-medium ${(hedgedMetrics.sharpeRatio || 0) > (valueNeutralMetrics.sharpeRatio || 0) ? "text-green-400" : "text-red-400"}`}
                    >
                      {(hedgedMetrics.sharpeRatio || 0) > (valueNeutralMetrics.sharpeRatio || 0)
                        ? "Hedge Factor Adj"
                        : "Value Neutral"}
                    </td>
                  </tr>
                  <tr className="bg-navy-900/30">
                    <td className="table-cell font-medium">Max Drawdown</td>
                    <td className="table-cell">${(hedgedMetrics.maxDrawdown || 0).toFixed(2)}</td>
                    <td className="table-cell">${(valueNeutralMetrics.maxDrawdown || 0).toFixed(2)}</td>
                    <td
                      className={`table-cell font-medium ${(hedgedMetrics.maxDrawdown || 0) < (valueNeutralMetrics.maxDrawdown || 0) ? "text-green-400" : "text-red-400"}`}
                    >
                      {(hedgedMetrics.maxDrawdown || 0) < (valueNeutralMetrics.maxDrawdown || 0)
                        ? "Hedge Factor Adj"
                        : "Value Neutral"}
                    </td>
                  </tr>
                  <tr className="bg-navy-900/50">
                    <td className="table-cell font-medium">Profit Factor</td>
                    <td className="table-cell">{(hedgedMetrics.profitFactor || 0).toFixed(2)}</td>
                    <td className="table-cell">{(valueNeutralMetrics.profitFactor || 0).toFixed(2)}</td>
                    <td
                      className={`table-cell font-medium ${(hedgedMetrics.profitFactor || 0) > (valueNeutralMetrics.profitFactor || 0) ? "text-green-400" : "text-red-400"}`}
                    >
                      {(hedgedMetrics.profitFactor || 0) > (valueNeutralMetrics.profitFactor || 0)
                        ? "Hedge Factor Adj"
                        : "Value Neutral"}
                    </td>
                  </tr>
                  <tr className="bg-navy-900/30">
                    <td className="table-cell font-medium">Expectancy</td>
                    <td className="table-cell">${(hedgedMetrics.expectancy || 0).toFixed(2)}</td>
                    <td className="table-cell">${(valueNeutralMetrics.expectancy || 0).toFixed(2)}</td>
                    <td
                      className={`table-cell font-medium ${(hedgedMetrics.expectancy || 0) > (valueNeutralMetrics.expectancy || 0) ? "text-green-400" : "text-red-400"}`}
                    >
                      {(hedgedMetrics.expectancy || 0) > (valueNeutralMetrics.expectancy || 0)
                        ? "Hedge Factor Adj"
                        : "Value Neutral"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Position Sizing Methods Explanation */}
          <div className="card">
            <h3 className="text-lg font-bold text-white mb-2">Position Sizing Methods</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-md font-semibold text-gold-400 mb-2">Hedge Factor Adj Position</h4>
                <p className="text-sm text-gray-300">
                  Theoretical approach using 1 unit of Stock A and β units of Stock B. This is the standard academic
                  pair trading approach that focuses on the spread behavior.
                </p>
                <p className="text-sm text-gray-300 mt-2">
                  <span className="font-medium">LONG formula:</span> (TCS_exit - TCS_entry) - β × (HCL_exit - HCL_entry)
                </p>
                <p className="text-sm text-gray-300 mt-1">
                  <span className="font-medium">SHORT formula:</span> (TCS_entry - TCS_exit) - β × (HCL_entry -
                  HCL_exit)
                </p>
              </div>
              <div>
                <h4 className="text-md font-semibold text-gold-400 mb-2">Value Neutral Position Size</h4>
                <p className="text-sm text-gray-300">
                  Equal dollar amounts invested in both legs of the trade. This approach balances capital exposure
                  between the two stocks regardless of their price levels.
                </p>
                <p className="text-sm text-gray-300 mt-2">
                  <span className="font-medium">Capital allocation:</span> 50% to Stock A, 50% to Stock B
                </p>
                <p className="text-sm text-gray-300 mt-1">
                  <span className="font-medium">P&L calculation:</span> Sum of profit/loss from both legs
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
