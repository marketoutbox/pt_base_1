"use client"

import { useState } from "react"
import { saveStockData, getStockData } from "../lib/indexedDB"
import StockTable from "../components/StockTable"

export default function Stocks() {
  const [symbols, setSymbols] = useState("")
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(false)

  async function fetchStockData() {
    if (!symbols.trim()) return

    setLoading(true)
    const symbolList = symbols
      .toUpperCase()
      .split(",")
      .map((s) => s.trim())

    let allStockData = []

    for (const symbol of symbolList) {
      try {
        console.log(`Fetching data for: ${symbol}`)

        const response = await fetch(`/api/stocks?symbol=${symbol}`)
        const data = await response.json()

        if (!data || !data.timestamp || !data.indicators?.quote?.[0]) {
          console.error(`Invalid data format for ${symbol}.`)
          continue
        }

        const timestamps = data.timestamp
        const quotes = data.indicators.quote[0]

        const formattedData = timestamps.map((time, index) => ({
          date: new Date(time * 1000).toISOString().split("T")[0], // Convert timestamp to date
          symbol,
          open: quotes.open[index] || 0,
          high: quotes.high[index] || 0,
          low: quotes.low[index] || 0,
          close: quotes.close[index] || 0,
        }))

        console.log(`Formatted Data for ${symbol}:`, formattedData)

        await saveStockData(symbol, formattedData)
        allStockData = [...allStockData, ...formattedData]
      } catch (error) {
        console.error(`Error fetching stock data for ${symbol}:`, error)
      }
    }

    setStocks(allStockData)
    setLoading(false)
  }

  async function loadStockData() {
    if (!symbols.trim()) return

    const symbolList = symbols
      .toUpperCase()
      .split(",")
      .map((s) => s.trim())
    let allStockData = []

    for (const symbol of symbolList) {
      const data = await getStockData(symbol)
      allStockData = [...allStockData, ...data]
    }

    setStocks(allStockData)
  }

  return (
    <div style={{ padding: "20px" }}>
      <h1>Stock Data</h1>
      <input
        type="text"
        placeholder="Enter Stock Symbols (comma-separated, e.g. AAPL,GOOGL,MSFT)"
        value={symbols}
        onChange={(e) => setSymbols(e.target.value)}
      />
      <button onClick={fetchStockData} disabled={loading}>
        {loading ? "Fetching..." : "Fetch & Store"}
      </button>
      <button onClick={loadStockData}>Load from IndexedDB</button>

      <StockTable stocks={stocks} />
    </div>
  )
}
