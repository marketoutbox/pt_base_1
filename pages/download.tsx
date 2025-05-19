"use client"

import { useState, useEffect } from "react"
import Layout from "../components/Layout"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Download, AlertCircle } from "lucide-react"
import { getDB } from "../lib/indexedDB"

export default function DownloadPage() {
  const [stocks, setStocks] = useState([])
  const [selectedStock, setSelectedStock] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch all available stocks from IndexedDB
  useEffect(() => {
    async function fetchStocks() {
      try {
        setLoading(true)
        const db = await getDB()
        const tx = db.transaction("stocks", "readonly")
        const store = tx.objectStore("stocks")
        const allStocks = await store.getAll()

        if (allStocks && allStocks.length > 0) {
          // Extract just the symbols
          const symbols = allStocks.map((stock) => stock.symbol)
          setStocks(symbols)
          if (symbols.length > 0) {
            setSelectedStock(symbols[0])
          }
        }
        setLoading(false)
      } catch (err) {
        console.error("Error fetching stocks:", err)
        setError("Failed to load stocks from database. Please make sure you have stock data stored.")
        setLoading(false)
      }
    }

    fetchStocks()
  }, [])

  // Handle stock selection change
  const handleStockChange = (e) => {
    setSelectedStock(e.target.value)
  }

  // Convert stock data to CSV and download
  const handleDownload = async () => {
    if (!selectedStock) return

    try {
      setLoading(true)
      const db = await getDB()
      const tx = db.transaction("stocks", "readonly")
      const store = tx.objectStore("stocks")
      const stockData = await store.get(selectedStock)

      if (stockData && stockData.data && stockData.data.length > 0) {
        // Convert data to CSV
        const csvContent = convertToCSV(stockData.data)

        // Create download link
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.setAttribute("href", url)
        link.setAttribute("download", `${selectedStock}_data.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } else {
        setError(`No data found for ${selectedStock}`)
      }
      setLoading(false)
    } catch (err) {
      console.error("Error downloading stock data:", err)
      setError("Failed to download stock data")
      setLoading(false)
    }
  }

  // Convert JSON data to CSV format
  const convertToCSV = (data) => {
    if (!data || data.length === 0) return ""

    // Get headers from the first object
    const headers = Object.keys(data[0])

    // Create CSV header row
    let csv = headers.join(",") + "\n"

    // Add data rows
    data.forEach((row) => {
      const values = headers.map((header) => {
        const value = row[header]
        // Handle strings with commas by wrapping in quotes
        if (typeof value === "string" && value.includes(",")) {
          return `"${value}"`
        }
        return value
      })
      csv += values.join(",") + "\n"
    })

    return csv
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <Card className="w-full max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Download Stock Data</CardTitle>
            <CardDescription>Export your stored stock data as CSV files</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {stocks.length === 0 && !loading ? (
              <Alert>
                <AlertDescription>
                  No stock data found in the database. Please import or fetch some stock data first.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-2">
                  <label htmlFor="stock-select" className="text-sm font-medium">
                    Select Stock
                  </label>
                  <Select
                    disabled={loading || stocks.length === 0}
                    value={selectedStock}
                    onValueChange={setSelectedStock}
                  >
                    <SelectTrigger id="stock-select">
                      <SelectValue placeholder="Select a stock" />
                    </SelectTrigger>
                    <SelectContent>
                      {stocks.map((symbol) => (
                        <SelectItem key={symbol} value={symbol}>
                          {symbol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={handleDownload} disabled={loading || !selectedStock} className="w-full">
                  {loading ? (
                    <span className="flex items-center">
                      <svg
                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
                      Processing...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <Download className="mr-2 h-4 w-4" />
                      Download CSV
                    </span>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
