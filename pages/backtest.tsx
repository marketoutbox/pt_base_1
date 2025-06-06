"use client"

import { useState, useEffect } from "react"
import { openDB } from "idb"

export default function Backtest() {
  const [stocks, setStocks] = useState([])
  const [selectedPair, setSelectedPair] = useState({ stockA: "", stockB: "" })
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [lookbackPeriod, setLookbackPeriod] = useState(60)
  const [entryZ, setEntryZ] = useState(2.0)
  const [exitZ, setExitZ] = useState(1.5)
  const [timeStop, setTimeStop] = useState(15)
  const [lossStop, setLossStop] = useState(-10)
  const [targetProfit, setTargetProfit] = useState(10)
  const [backtestData, setBacktestData] = useState([])
  const [tradeResults, setTradeResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)

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

      // Sort data by date ascending for proper chronological order
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
      const ratios = []

      for (let i = 0; i < minLength; i++) {
        ratios.push({
          date: alignedPricesA[i].date,
          ratio: alignedPricesA[i].close / alignedPricesB[i].close,
          stockAClose: alignedPricesA[i].close,
          stockBClose: alignedPricesB[i].close,
        })
      }

      // Calculate Z-scores using user-defined lookback period
      const zScores = []
      for (let i = 0; i < ratios.length; i++) {
        const windowData = ratios.slice(Math.max(0, i - lookbackPeriod + 1), i + 1).map((r) => r.ratio)
        if (windowData.length >= lookbackPeriod) {
          const mean = windowData.reduce((sum, val) => sum + val, 0) / windowData.length
          const variance = windowData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (windowData.length - 1)
          const stdDev = Math.sqrt(variance)
          const zScore = stdDev > 0 ? (ratios[i].ratio - mean) / stdDev : 0
          zScores.push(zScore)
        } else {
          zScores.push(0)
        }
      }

      const tableData = ratios.map((item, index) => ({
        date: item.date,
        stockAClose: item.stockAClose,
        stockBClose: item.stockBClose,
        ratio: item.ratio,
        zScore: zScores[index] || 0,
      }))
      setBacktestData(tableData)

      // Trade logic with stop loss and target
      const trades = []
      let openTrade = null

      for (let i = 1; i < tableData.length; i++) {
        const prevZ = tableData[i - 1].zScore
        const currZ = tableData[i].zScore
        const currentRow = tableData[i]

        if (!openTrade) {
          // Entry conditions: Z-score crosses the entry threshold
          if (Math.abs(prevZ) < entryZ && Math.abs(currZ) >= entryZ) {
            const tradeType = currZ > 0 ? "SHORT" : "LONG"
            openTrade = {
              entryDate: currentRow.date,
              type: tradeType,
              entryIndex: i,
              entryZScore: currZ,
              entryRatio: currentRow.ratio,
              entryStockAPrice: currentRow.stockAClose,
              entryStockBPrice: currentRow.stockBClose,
            }
          }
        } else {
          const entryDate = new Date(openTrade.entryDate)
          const currentDate = new Date(currentRow.date)
          const holdingPeriod = Math.floor((currentDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))

          // Calculate current profit
          const entryRatio = openTrade.entryRatio
          const exitRatio = currentRow.ratio
          let currentProfit = 0

          // For ratio trading, we invest equal amounts in both stocks
          // If ratio goes up: Long A profits, Short B loses (net effect is half the ratio change)
          // If ratio goes down: Long A loses, Short B profits (net effect is half the ratio change)
          const ratioChange = (exitRatio - entryRatio) / entryRatio

          if (openTrade.type === "LONG") {
            // Long the ratio: profit when ratio increases
            currentProfit = (ratioChange * 100) / 2 // Divide by 2 because profit is split between two legs
          } else {
            // Short the ratio: profit when ratio decreases
            currentProfit = (-ratioChange * 100) / 2 // Divide by 2 because profit is split between two legs
          }

          // Exit conditions (priority order: Stop Loss > Target > Time > Z-Score)
          let exitReason = ""
          let shouldExit = false

          if (currentProfit <= lossStop) {
            exitReason = "Stop Loss"
            shouldExit = true
          } else if (currentProfit >= targetProfit) {
            exitReason = "Target Profit"
            shouldExit = true
          } else if (holdingPeriod >= timeStop) {
            exitReason = "Time Stop"
            shouldExit = true
          } else if (Math.abs(currZ) <= exitZ) {
            exitReason = "Z-Score Exit"
            shouldExit = true
          }

          if (shouldExit) {
            // Calculate max drawdown during the trade using actual portfolio P&L
            const tradeSlice = tableData.slice(openTrade.entryIndex, i + 1)
            let maxDrawdown = 0
            let peakProfit = 0

            for (const dataPoint of tradeSlice) {
              // Calculate profit at each point during the trade
              const ratioAtPoint = dataPoint.ratio
              const ratioChangeAtPoint = (ratioAtPoint - entryRatio) / entryRatio

              let profitAtPoint = 0
              if (openTrade.type === "LONG") {
                profitAtPoint = (ratioChangeAtPoint * 100) / 2
              } else {
                profitAtPoint = (-ratioChangeAtPoint * 100) / 2
              }

              // Track peak profit
              if (profitAtPoint > peakProfit) {
                peakProfit = profitAtPoint
              }

              // Calculate drawdown from peak
              const drawdownAtPoint = peakProfit - profitAtPoint
              if (drawdownAtPoint > maxDrawdown) {
                maxDrawdown = drawdownAtPoint
              }
            }

            trades.push({
              entryDate: openTrade.entryDate,
              exitDate: currentRow.date,
              type: openTrade.type,
              entryZScore: openTrade.entryZScore.toFixed(2),
              exitZScore: currZ.toFixed(2),
              holdingPeriod: holdingPeriod.toString(),
              profitPercent: currentProfit.toFixed(2),
              maxDrawdownPercent: maxDrawdown.toFixed(2),
              exitReason: exitReason,
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

  // Calculate summary statistics
  const profitableTrades = tradeResults.filter((t) => Number.parseFloat(t.profitPercent) > 0).length
  const winRate = tradeResults.length > 0 ? (profitableTrades / tradeResults.length) * 100 : 0
  const totalProfit = tradeResults.reduce((sum, trade) => sum + Number.parseFloat(trade.profitPercent), 0)
  const avgProfit = tradeResults.length > 0 ? totalProfit / tradeResults.length : 0

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-bold text-white">Pair Trading Backtest</h1>
        <p className="text-xl text-gray-300">Price Ratio Model</p>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <label className="block text-base font-medium text-gray-300 mb-2">Lookback Period</label>
            <input
              type="number"
              min="10"
              max="200"
              value={lookbackPeriod}
              onChange={(e) => setLookbackPeriod(Number.parseInt(e.target.value))}
              className="input-field"
            />
            <p className="mt-1 text-sm text-gray-400">Days for rolling Z-score calculation</p>
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
            <p className="mt-1 text-sm text-gray-400">Absolute Z-score to enter trade</p>
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
            <p className="mt-1 text-sm text-gray-400">Absolute Z-score to exit trade</p>
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
                value={timeStop}
                onChange={(e) => setTimeStop(Number.parseInt(e.target.value))}
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
                value={lossStop}
                onChange={(e) => setLossStop(Number.parseFloat(e.target.value))}
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
                value={targetProfit}
                onChange={(e) => setTargetProfit(Number.parseFloat(e.target.value))}
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
                    <th className="table-header">Ratio</th>
                    <th className="table-header">Z-score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800">
                  {/* Display data from oldest to newest (chronological order) */}
                  {backtestData.map((row, index) => (
                    <tr key={index} className={index % 2 === 0 ? "bg-navy-900/50" : "bg-navy-900/30"}>
                      <td className="table-cell">{row.date}</td>
                      <td className="table-cell">{row.stockAClose.toFixed(2)}</td>
                      <td className="table-cell">{row.stockBClose.toFixed(2)}</td>
                      <td className="table-cell">{row.ratio.toFixed(4)}</td>
                      <td
                        className={`table-cell font-medium ${
                          Math.abs(row.zScore) >= entryZ
                            ? "text-gold-400"
                            : Math.abs(row.zScore) >= exitZ
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
                  <th className="table-header">Entry Z</th>
                  <th className="table-header">Exit Z</th>
                  <th className="table-header">Days</th>
                  <th className="table-header">Profit %</th>
                  <th className="table-header">Max DD %</th>
                  <th className="table-header">Exit Reason</th>
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
                    <td className="table-cell">{trade.entryZScore}</td>
                    <td className="table-cell">{trade.exitZScore}</td>
                    <td className="table-cell">{trade.holdingPeriod}</td>
                    <td
                      className={`table-cell font-medium ${
                        Number.parseFloat(trade.profitPercent) >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {trade.profitPercent}%
                    </td>
                    <td className="table-cell text-red-400">{trade.maxDrawdownPercent}%</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-navy-800/50 rounded-lg p-4 border border-navy-700">
              <p className="text-sm text-gray-300">Total Trades</p>
              <p className="text-2xl font-bold text-gold-400">{tradeResults.length}</p>
            </div>
            <div className="bg-navy-800/50 rounded-lg p-4 border border-navy-700">
              <p className="text-sm text-gray-300">Profitable Trades</p>
              <p className="text-2xl font-bold text-green-400">{profitableTrades}</p>
            </div>
            <div className="bg-navy-800/50 rounded-lg p-4 border border-navy-700">
              <p className="text-sm text-gray-300">Win Rate</p>
              <p className="text-2xl font-bold text-gold-400">{winRate.toFixed(1)}%</p>
            </div>
            <div className="bg-navy-800/50 rounded-lg p-4 border border-navy-700">
              <p className="text-sm text-gray-300">Avg. Profit per Trade</p>
              <p className={`text-2xl font-bold ${avgProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                {avgProfit.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
