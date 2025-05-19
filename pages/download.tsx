"use client"

import { useState, useEffect } from "react"
import Layout from "../components/Layout"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Download, AlertCircle } from "lucide-react"
import { getAllStockSymbols, getStockData } from "../lib/indexedDB"

export default function DownloadPage() {
  const [symbols, setSymbols] = useState<string[]>([])
  const [selectedSymbol, setSelectedSymbol] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSymbols() {
      try {
        setLoading(true)
        const stockSymbols = await getAllStockSymbols()
        setSymbols(stockSymbols)
        setError(null)
      } catch (err) {
        console.error("Error fetching stock symbols:", err)
        setError("Failed to load stock symbols from database")
      } finally {
        setLoading(false)
      }
    }

    fetchSymbols()
  }, [])

  const handleDownload = async () => {
    if (!selectedSymbol) {
      setError("Please select a stock symbol first")
      return
    }

    try {
      setLoading(true)
      const stockData = await getStockData(selectedSymbol)

      if (!stockData || !stockData.data || stockData.data.length === 0) {
        setError(`No data found for ${selectedSymbol}`)
        setLoading(false)
        return
      }

      // Convert data to CSV
      const headers = ["date", "symbol", "open", "high", "low", "close"]
      const csvContent = [
        headers.join(","),
        ...stockData.data.map((row) => {
          return headers
            .map((header) => {
              // Handle special characters and commas in data
              const value = row[header]
              if (typeof value === "string" && (value.includes(",") || value.includes('"') || value.includes("\n"))) {
                return `"${value.replace(/"/g, '""')}"`
              }
              return value
            })
            .join(",")
        }),
      ].join("\n")

      // Create and download the file
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.setAttribute("href", url)
      link.setAttribute("download", `${selectedSymbol}_data.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      setError(null)
    } catch (err) {
      console.error("Error downloading stock data:", err)
      setError(`Failed to download data for ${selectedSymbol}`)
    } finally {
      setLoading(false)
    }
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

            {symbols.length === 0 && !loading ? (
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
                    disabled={loading || symbols.length === 0}
                    value={selectedSymbol}
                    onValueChange={setSelectedSymbol}
                  >
                    <SelectTrigger id="stock-select">
                      <SelectValue placeholder="Select a stock" />
                    </SelectTrigger>
                    <SelectContent>
                      {symbols.map((symbol) => (
                        <SelectItem key={symbol} value={symbol}>
                          {symbol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={handleDownload} disabled={loading || !selectedSymbol} className="w-full">
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
