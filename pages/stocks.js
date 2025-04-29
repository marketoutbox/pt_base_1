"use client"

import { useState, useEffect, useCallback } from "react"
import { saveStockData, getStockData } from "../lib/indexedDB"
import StockTable from "../components/StockTable"

export default function Stocks() {
  // Initialize with empty values and update after mount
  const [csvUrl, setCsvUrl] = useState("")
  const [refreshInterval, setRefreshInterval] = useState(0)
  const [lastFetchTime, setLastFetchTime] = useState(null)
  const [symbols, setSymbols] = useState("")
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ text: "", type: "" })
  const [csvLoading, setCsvLoading] = useState(false)
  const [intervalId, setIntervalId] = useState(null)
  const [isClient, setIsClient] = useState(false)

  // Load localStorage values after component mounts on client
  useEffect(() => {
    setIsClient(true)

    // Now it's safe to access localStorage
    const storedCsvUrl = localStorage.getItem("csvUrl") || ""
    const storedRefreshInterval = Number.parseInt(localStorage.getItem("refreshInterval") || "0", 10)
    const storedLastFetchTime = localStorage.getItem("lastFetchTime")
      ? Number.parseInt(localStorage.getItem("lastFetchTime"), 10)
      : null

    setCsvUrl(storedCsvUrl)
    setRefreshInterval(storedRefreshInterval)
    setLastFetchTime(storedLastFetchTime)
  }, [])

  // Add new function to fetch data from Google Sheets CSV
  const fetchFromGoogleSheet = useCallback(async () => {
    if (!csvUrl.trim()) {
      setMessage({ text: "Please enter a valid Google Sheets CSV URL", type: "error" })
      return
    }

    setCsvLoading(true)
    setMessage({ text: "", type: "" })

    try {
      // Fetch the CSV data
      const response = await fetch(csvUrl)

      if (!response.ok) {
        throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`)
      }

      const csvText = await response.text()

      // Parse CSV
      const rows = csvText.split("\n")
      const headers = rows[0].split(",").map((header) => header.trim())

      // Validate headers
      const requiredHeaders = ["symbol", "date", "open", "high", "low", "close"]
      const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h))

      if (missingHeaders.length > 0) {
        throw new Error(`CSV is missing required headers: ${missingHeaders.join(", ")}`)
      }

      // Process data rows
      const stockData = []
      const processedSymbols = new Set()
      const symbolData = {}

      for (let i = 1; i < rows.length; i++) {
        if (!rows[i].trim()) continue

        const values = rows[i].split(",").map((val) => val.trim())
        if (values.length !== headers.length) continue

        const rowData = {}
        headers.forEach((header, index) => {
          rowData[header] = values[index]
        })

        const symbol = rowData.symbol
        processedSymbols.add(symbol)

        if (!symbolData[symbol]) {
          symbolData[symbol] = []
        }

        const dataPoint = {
          date: rowData.date,
          symbol: symbol,
          open: Number.parseFloat(rowData.open) || 0,
          high: Number.parseFloat(rowData.high) || 0,
          low: Number.parseFloat(rowData.low) || 0,
          close: Number.parseFloat(rowData.close) || 0,
        }

        symbolData[symbol].push(dataPoint)
        stockData.push(dataPoint)
      }

      // Save data to IndexedDB for each symbol
      let savedCount = 0
      for (const symbol of processedSymbols) {
        if (symbolData[symbol] && symbolData[symbol].length > 0) {
          await saveStockData(symbol, symbolData[symbol])
          savedCount++
        }
      }

      setStocks(stockData)

      // Update last fetch time
      const now = Date.now()
      setLastFetchTime(now)
      localStorage.setItem("lastFetchTime", now.toString())

      setMessage({
        text: `Successfully imported data for ${savedCount} symbols (${stockData.length} records)`,
        type: "success",
      })
    } catch (error) {
      console.error("Error fetching from Google Sheets:", error)
      setMessage({ text: `Error: ${error.message}`, type: "error" })
    } finally {
      setCsvLoading(false)
    }
  }, [csvUrl])

  // Set up auto-refresh with a clean implementation
  useEffect(() => {
    // Only run this effect on the client side
    if (!isClient) return

    // Don't set up interval if no refresh interval or URL
    if (refreshInterval <= 0 || !csvUrl) {
      return
    }

    console.log(`Setting up auto-refresh: Every ${refreshInterval} minutes`)

    // Convert minutes to milliseconds
    const intervalMs = refreshInterval * 60 * 1000

    // Set up the interval
    const timerId = setInterval(() => {
      console.log(`Auto-refresh triggered: ${new Date().toLocaleTimeString()}`)
      fetchFromGoogleSheet()
    }, intervalMs)

    // Store the timer ID
    setIntervalId(timerId)

    // Cleanup function
    return () => {
      console.log("Cleaning up interval timer")
      clearInterval(timerId)
    }
  }, [refreshInterval, csvUrl, fetchFromGoogleSheet, isClient]) // Include isClient in dependencies

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

  // Update the setupAutoRefresh function to use the last fetch time
  function setupAutoRefresh() {
    // Clear any existing interval
    if (intervalId) {
      clearInterval(intervalId)
      setIntervalId(null)
    }

    if (refreshInterval > 0) {
      // Store the last fetch time
      const now = Date.now()
      setLastFetchTime(now)
      localStorage.setItem("lastFetchTime", now.toString())

      // Immediately fetch data once when setting up the timer
      fetchFromGoogleSheet()

      // The interval will be set up by the useEffect
      setMessage({
        text: `Auto-refresh set for every ${refreshInterval} minute${refreshInterval > 1 ? "s" : ""}`,
        type: "success",
      })
    } else {
      setMessage({ text: "Auto-refresh disabled", type: "info" })
    }
  }

  // Modify the setCsvUrl function to also save to localStorage
  const updateCsvUrl = (url) => {
    setCsvUrl(url)
    localStorage.setItem("csvUrl", url)
  }

  // Modify the setRefreshInterval function to also save to localStorage
  const updateRefreshInterval = (interval) => {
    const parsedInterval = Number.parseInt(interval) || 0
    setRefreshInterval(parsedInterval)
    localStorage.setItem("refreshInterval", parsedInterval.toString())
  }

  // Format date consistently for both server and client
  const formatDate = (timestamp) => {
    if (!timestamp) return "Never"

    const date = new Date(timestamp)
    // Use a consistent date format that doesn't depend on locale
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-bold text-white">Stock Data Management</h1>
        <p className="text-xl text-gray-300">Fetch and manage stock data from Yahoo Finance</p>
      </div>

      <div className="card">
        <h2 className="text-2xl font-bold text-white mb-4">Yahoo Finance Data</h2>
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
        </div>
      </div>

      {/* Only render client-specific content after hydration */}
      {isClient && (
        <>
          {/* Google Sheet Fetcher section */}
          <div className="card">
            <h2 className="text-2xl font-bold text-white mb-4">Google Sheet Fetcher</h2>
            <div className="space-y-6">
              <div>
                <label htmlFor="csvUrl" className="block text-base font-medium text-gray-300 mb-2">
                  Google Sheets CSV URL
                </label>

                <input
                  id="csvUrl"
                  placeholder="Enter the published CSV URL from Google Sheets"
                  value={csvUrl}
                  onChange={(e) => updateCsvUrl(e.target.value)}
                  className="input-field"
                />

                <p className="mt-1 text-sm text-gray-400">
                  Publish your Google Sheet as CSV and paste the URL here. Format must include: symbol, date, open,
                  high, low, close
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="refreshInterval" className="block text-base font-medium text-gray-300 mb-2">
                    Auto-Refresh Interval (minutes)
                  </label>
                  <div className="flex gap-4">
                    <input
                      id="refreshInterval"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0 (disabled)"
                      value={refreshInterval}
                      onChange={(e) => updateRefreshInterval(e.target.value)}
                      className="input-field"
                    />

                    <button onClick={setupAutoRefresh} className="btn-secondary whitespace-nowrap">
                      {intervalId ? "Update Timer" : "Set Timer"}
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-gray-400">
                    Set to 0 to disable auto-refresh. Data will be updated at the specified interval.
                  </p>
                </div>

                <div className="flex items-end">
                  <button onClick={fetchFromGoogleSheet} disabled={csvLoading} className="btn-primary w-full">
                    {csvLoading ? (
                      <span className="flex items-center justify-center">
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
                        Importing...
                      </span>
                    ) : (
                      "Import from Google Sheets"
                    )}
                  </button>
                </div>
              </div>

              {intervalId && (
                <div className="p-3 bg-navy-800/50 rounded-md border border-navy-700">
                  <div className="flex justify-between items-center">
                    <span className="text-gold-400">
                      Auto-refresh active: Every {refreshInterval} minute{refreshInterval > 1 ? "s" : ""}
                    </span>

                    <button
                      onClick={() => {
                        clearInterval(intervalId)
                        setIntervalId(null)
                        updateRefreshInterval(0)
                        setMessage({ text: "Auto-refresh disabled", type: "info" })
                      }}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Stop
                    </button>
                  </div>
                </div>
              )}

              {lastFetchTime && (
                <div className="mt-3 p-3 bg-navy-800/50 rounded-md border border-navy-700">
                  <div className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-2 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="text-gray-300">
                      Last updated: <span className="text-gold-400">{formatDate(lastFetchTime)}</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

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

      {stocks.length > 0 && (
        <div className="card">
          <h2 className="text-2xl font-bold text-white mb-4">Stock Data ({stocks.length} records)</h2>
          <StockTable stocks={stocks} />
        </div>
      )}
    </div>
  )
}
