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
  const [tradeResults, setTradeResults] = useState([])
  const [lookbackPeriod, setLookbackPeriod] = useState(50)
  const [isLoading, setIsLoading] = useState(false)
  const [capitalPerTrade, setCapitalPerTrade] = useState(100000)

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

      // Fixed trade logic
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
          // Exit conditions
          const entryDate = new Date(openTrade.entryDate)
          const currentDate = new Date(currentRow.date)
          const holdingPeriod = Math.floor((currentDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))

          const shouldExit =
            (openTrade.type === "LONG" && prevZ < -exitZ && currZ >= -exitZ) ||
            (openTrade.type === "SHORT" && prevZ > exitZ && currZ <= exitZ) ||
            holdingPeriod >= 15

          if (shouldExit) {
            const exitSpread = currentRow.spread
            const currentHedgeRatio = currentRow.hedgeRatio
            const hedgeRatio = openTrade.entryHedgeRatio

            // 1. Calculate P&L using Hedged Position approach (theoretical)
            let hedgedPnL
            if (openTrade.type === "LONG") {
              // LONG spread: PnL = (TCS_exit - TCS_entry) - β × (HCL_exit - HCL_entry)
              hedgedPnL =
                currentRow.stockAClose -
                openTrade.entryStockAPrice -
                hedgeRatio * (currentRow.stockBClose - openTrade.entryStockBPrice)
            } else {
              // SHORT spread: PnL = (TCS_entry - TCS_exit) - β × (HCL_entry - HCL_exit)
              hedgedPnL =
                openTrade.entryStockAPrice -
                currentRow.stockAClose -
                hedgeRatio * (openTrade.entryStockBPrice - currentRow.stockBClose)
            }

            // 2. Calculate P&L using Dollar Neutral approach
            // Allocate equal capital to both legs
            const capitalPerLeg = capitalPerTrade / 2

            // Calculate number of shares for each stock
            const stockAShares = Math.floor(capitalPerLeg / openTrade.entryStockAPrice)
            const stockBShares = Math.floor(capitalPerLeg / openTrade.entryStockBPrice)

            // Calculate P&L for each leg
            let stockAPnL, stockBPnL
            if (openTrade.type === "LONG") {
              // LONG spread: Long Stock A, Short Stock B
              stockAPnL = stockAShares * (currentRow.stockAClose - openTrade.entryStockAPrice)
              stockBPnL = stockBShares * (openTrade.entryStockBPrice - currentRow.stockBClose)
            } else {
              // SHORT spread: Short Stock A, Long Stock B
              stockAPnL = stockAShares * (openTrade.entryStockAPrice - currentRow.stockAClose)
              stockBPnL = stockBShares * (currentRow.stockBClose - openTrade.entryStockBPrice)
            }

            const dollarNeutralPnL = stockAPnL + stockBPnL

            // Calculate ROI for both methods
            const theoreticalCapital = openTrade.entryStockAPrice + hedgeRatio * openTrade.entryStockBPrice
            const hedgedROI = (hedgedPnL / theoreticalCapital) * 100
            const dollarNeutralROI = (dollarNeutralPnL / capitalPerTrade) * 100

            // Calculate max drawdown during the trade for both methods
            const tradeSlice = tableData.slice(openTrade.entryIndex, i + 1)
            let maxHedgedDrawdown = 0
            let maxDollarNeutralDrawdown = 0

            for (const row of tradeSlice) {
              // Hedged Position drawdown
              let currentHedgedProfit
              if (openTrade.type === "LONG") {
                currentHedgedProfit =
                  row.stockAClose -
                  openTrade.entryStockAPrice -
                  hedgeRatio * (row.stockBClose - openTrade.entryStockBPrice)
              } else {
                currentHedgedProfit =
                  openTrade.entryStockAPrice -
                  row.stockAClose -
                  hedgeRatio * (openTrade.entryStockBPrice - row.stockBClose)
              }
              const hedgedDrawdown = Math.max(0, hedgedPnL - currentHedgedProfit)
              maxHedgedDrawdown = Math.max(maxHedgedDrawdown, hedgedDrawdown)

              // Dollar Neutral drawdown
              let currentStockAPnL, currentStockBPnL
              if (openTrade.type === "LONG") {
                currentStockAPnL = stockAShares * (row.stockAClose - openTrade.entryStockAPrice)
                currentStockBPnL = stockBShares * (openTrade.entryStockBPrice - row.stockBClose)
              } else {
                currentStockAPnL = stockAShares * (openTrade.entryStockAPrice - row.stockAClose)
                currentStockBPnL = stockBShares * (row.stockBClose - openTrade.entryStockBPrice)
              }
              const currentDollarNeutralPnL = currentStockAPnL + currentStockBPnL
              const dollarNeutralDrawdown = Math.max(0, dollarNeutralPnL - currentDollarNeutralPnL)
              maxDollarNeutralDrawdown = Math.max(maxDollarNeutralDrawdown, dollarNeutralDrawdown)
            }

            trades.push({
              entryDate: openTrade.entryDate,
              exitDate: currentRow.date,
              type: openTrade.type,
              holdingPeriod: holdingPeriod.toString(),
              hedgedPnL: hedgedPnL.toFixed(2),
              dollarNeutralPnL: dollarNeutralPnL.toFixed(2),
              hedgedROI: hedgedROI.toFixed(2),
              dollarNeutralROI: dollarNeutralROI.toFixed(2),
              hedgedDrawdown: maxHedgedDrawdown.toFixed(2),
              dollarNeutralDrawdown: maxDollarNeutralDrawdown.toFixed(2),
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
              entryTCSPrice: openTrade.entryStockAPrice.toFixed(2),
              exitTCSPrice: currentRow.stockAClose.toFixed(2),
              entryHCLPrice: openTrade.entryStockBPrice.toFixed(2),
              exitHCLPrice: currentRow.stockBClose.toFixed(2),
              theoreticalCapital: theoreticalCapital.toFixed(2),
            })

            openTrade = null
          }
        }
      }

      setTradeResults(trades)
    } catch (error) {
      console.error("Error in backtest:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate summary statistics for both methods
  const profitableHedgedTrades = tradeResults.filter((t) => Number.parseFloat(t.hedgedPnL) > 0).length
  const profitableDollarNeutralTrades = tradeResults.filter((t) => Number.parseFloat(t.dollarNeutralPnL) > 0).length

  const winRateHedged = tradeResults.length > 0 ? (profitableHedgedTrades / tradeResults.length) * 100 : 0
  const winRateDollarNeutral = tradeResults.length > 0 ? (profitableDollarNeutralTrades / tradeResults.length) * 100 : 0

  const totalHedgedProfit = tradeResults.reduce((sum, trade) => sum + Number.parseFloat(trade.hedgedPnL), 0)
  const totalDollarNeutralProfit = tradeResults.reduce(
    (sum, trade) => sum + Number.parseFloat(trade.dollarNeutralPnL),
    0,
  )

  const avgHedgedProfit = tradeResults.length > 0 ? totalHedgedProfit / tradeResults.length : 0
  const avgDollarNeutralProfit = tradeResults.length > 0 ? totalDollarNeutralProfit / tradeResults.length : 0

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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
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
            <p className="mt-1 text-sm text-gray-400">Amount for dollar-neutral calculation</p>
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

      {tradeResults.length > 0 && !isLoading && (
        <div className="card">
          <h2 className="text-2xl font-bold text-white mb-4">Trade Results</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-navy-700">
              <thead className="bg-navy-800">
                <tr>
                  <th className="table-header">Entry Date</th>
                  <th className="table-header">Exit Date</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Days</th>
                  <th className="table-header">Hedged P&L ($)</th>
                  <th className="table-header">Dollar Neutral P&L ($)</th>
                  <th className="table-header">Hedged ROI (%)</th>
                  <th className="table-header">Dollar Neutral ROI (%)</th>
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
                        Number.parseFloat(trade.hedgedPnL) >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      ${trade.hedgedPnL}
                    </td>
                    <td
                      className={`table-cell font-medium ${
                        Number.parseFloat(trade.dollarNeutralPnL) >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      ${trade.dollarNeutralPnL}
                    </td>
                    <td
                      className={`table-cell ${
                        Number.parseFloat(trade.hedgedROI) >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {trade.hedgedROI}%
                    </td>
                    <td
                      className={`table-cell ${
                        Number.parseFloat(trade.dollarNeutralROI) >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {trade.dollarNeutralROI}%
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

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-bold text-white mb-4">Hedged Position Results</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-navy-800/50 rounded-lg p-4 border border-navy-700">
                  <p className="text-sm text-gray-300">Total Trades</p>
                  <p className="text-2xl font-bold text-gold-400">{tradeResults.length}</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-4 border border-navy-700">
                  <p className="text-sm text-gray-300">Profitable Trades</p>
                  <p className="text-2xl font-bold text-green-400">{profitableHedgedTrades}</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-4 border border-navy-700">
                  <p className="text-sm text-gray-300">Win Rate</p>
                  <p className="text-2xl font-bold text-gold-400">{winRateHedged.toFixed(1)}%</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-4 border border-navy-700">
                  <p className="text-sm text-gray-300">Avg. Profit per Trade</p>
                  <p className={`text-2xl font-bold ${avgHedgedProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                    ${avgHedgedProfit.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold text-white mb-4">Dollar Neutral Results</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-navy-800/50 rounded-lg p-4 border border-navy-700">
                  <p className="text-sm text-gray-300">Total Trades</p>
                  <p className="text-2xl font-bold text-gold-400">{tradeResults.length}</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-4 border border-navy-700">
                  <p className="text-sm text-gray-300">Profitable Trades</p>
                  <p className="text-2xl font-bold text-green-400">{profitableDollarNeutralTrades}</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-4 border border-navy-700">
                  <p className="text-sm text-gray-300">Win Rate</p>
                  <p className="text-2xl font-bold text-gold-400">{winRateDollarNeutral.toFixed(1)}%</p>
                </div>
                <div className="bg-navy-800/50 rounded-lg p-4 border border-navy-700">
                  <p className="text-sm text-gray-300">Avg. Profit per Trade</p>
                  <p
                    className={`text-2xl font-bold ${avgDollarNeutralProfit >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    ${avgDollarNeutralProfit.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 p-4 bg-navy-800/50 rounded-lg border border-navy-700">
            <h3 className="text-lg font-bold text-white mb-2">Position Sizing Methods</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-md font-semibold text-gold-400 mb-2">Hedged Position</h4>
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
                <h4 className="text-md font-semibold text-gold-400 mb-2">Dollar Neutral</h4>
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
        </div>
      )}
    </div>
  )
}
