"use client"

import { useState } from "react"
import { saveStockData, getStockData } from "../lib/indexedDB"

export default function Stocks() {
  const [symbols, setSymbols] = useState("")
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ text: "", type: "" })

  async function fetchStockData() {
    if (!symbols.trim()) {
      setMessage({ text: "Please enter at least one stock symbol", type: "error" })
      return
    }

    setLoading(true)
    setMessage({ text: "", type: "" })

    const symbolList = symbols
      .toUpperCase()
      .split(",")
      .map((s) => s.trim())

    let allStockData = []
    let successCount = 0
    let errorCount = 0

    for (const symbol of symbolList) {
      try {
        console.log(`Fetching data for: ${symbol}`)

        const response = await fetch(`/api/stocks?symbol=${symbol}`)
        const data = await response.json()

        if (!data || !data.timestamp || !data.indicators?.quote?.[0]) {
          console.error(`Invalid data format for ${symbol}.`)
          errorCount++
          continue
        }

        const timestamps = data.timestamp
        const quotes = data.indicators.quote[0]

        const formattedData = timestamps.map((time, index) => ({
          date: new Date(time * 1000).toISOString().split("T")[0],
          symbol,
          open: quotes.open[index] || 0,
          high: quotes.high[index] || 0,
          low: quotes.low[index] || 0,
          close: quotes.close[index] || 0,
        }))

        console.log(`Formatted Data for ${symbol}:`, formattedData)

        await saveStockData(symbol, formattedData)
        allStockData = [...allStockData, ...formattedData]
        successCount++
      } catch (error) {
        console.error(`Error fetching stock data for ${symbol}:`, error)
        errorCount++
      }
    }

    setStocks(allStockData)
    setLoading(false)

    if (successCount > 0) {
      setMessage({
        text: `Successfully fetched data for ${successCount} symbol${successCount > 1 ? "s" : ""}${errorCount > 0 ? ` (${errorCount} failed)` : ""}`,
        type: "success",
      })
    } else {
      setMessage({ text: "Failed to fetch data for all symbols", type: "error" })
    }
  }

  async function loadStockData() {
    if (!symbols.trim()) {
      setMessage({ text: "Please enter at least one stock symbol", type: "error" })
      return
    }

    setMessage({ text: "", type: "" })

    const symbolList = symbols
      .toUpperCase()
      .split(",")
      .map((s) => s.trim())

    let allStockData = []
    let loadedCount = 0

    for (const symbol of symbolList) {
      const data = await getStockData(symbol)
      if (data && data.length > 0) {
        allStockData = [...allStockData, ...data]
        loadedCount++
      }
    }

    setStocks(allStockData)

    if (loadedCount > 0) {
      setMessage({
        text: `Loaded data for ${loadedCount} symbol${loadedCount > 1 ? "s" : ""}`,
        type: "success",
      })
    } else {
      setMessage({ text: "No data found for the specified symbols", type: "warning" })
    }
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-bold text-white">Stock Data Management</h1>
        <p className="text-xl text-gray-300">Fetch and manage stock data from Yahoo Finance</p>
      </div>

      <div className="card">
        <div className="space-y-6">
          <div>
            <label htmlFor="symbols" className="block text-base font-medium text-gray-300 mb-2">
              Stock Symbols
            </label>
            <input
              id="symbols"
              placeholder="Enter Stock Symbols (comma-separated, e.g. AAPL,GOOGL,MSFT)"
              value={symbols}
              onChange={(e) => setSymbols(e.target.value)}
              className="input-field"
            />
            <p className="mt-1 text-sm text-gray-400">Enter comma-separated stock symbols to fetch or load data</p>
          </div>

          <div className="flex flex-wrap gap-4">
            <button onClick={fetchStockData} disabled={loading} className="btn-primary">
              {loading ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Fetching...
                </span>
              ) : (
                "Fetch & Store"
              )}
            </button>
            <button onClick={loadStockData} className="btn-secondary">
              Load from IndexedDB
            </button>
          </div>

          {message.text && (
            <div
              className={`p-4 rounded-md ${
                message.type === "success"
                  ? "bg-green-900/30 text-green-300 border border-green-800"
                  : message.type === "error"
                    ? "bg-red-900/30 text-red-300 border border-red-800"
                    : "bg-yellow-900/30 text-yellow-300 border border-yellow-800"
              }`}
            >
              {message.text}
            </div>
          )}
        </div>
      </div>

      {stocks.length > 0 && (
        <div className="card">
          <h2 className="text-2xl font-bold text-white mb-4">Stock Data ({stocks.length} records)</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-navy-700">
              <thead className="bg-navy-800">
                <tr>
                  <th className="table-header">Date</th>
                  <th className="table-header">Symbol</th>
                  <th className="table-header">Open</th>
                  <th className="table-header">High</th>
                  <th className="table-header">Low</th>
                  <th className="table-header">Close</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800">
                {stocks.map((stock, index) => (
                  <tr key={index} className={index % 2 === 0 ? "bg-navy-900/50" : "bg-navy-900/30"}>
                    <td className="table-cell">{stock.date}</td>
                    <td className="table-cell text-gold-400 font-medium">{stock.symbol}</td>
                    <td className="table-cell">{stock.open.toFixed(2)}</td>
                    <td className="table-cell">{stock.high.toFixed(2)}</td>
                    <td className="table-cell">{stock.low.toFixed(2)}</td>
                    <td className="table-cell">{stock.close.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
