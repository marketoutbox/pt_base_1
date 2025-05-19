import { useState, useEffect } from "react"
import Layout from "../components/Layout"
import Select from "../components/Select"
import Button from "../components/Button"
import { getDB, getStockData } from "../lib/indexedDB"

export default function Download() {
  const [stocks, setStocks] = useState<string[]>([])
  const [selectedStock, setSelectedStock] = useState<string>("")
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [message, setMessage] = useState<string>("")

  // Fetch available stocks from IndexedDB
  useEffect(() => {
    async function fetchStocks() {
      try {
        const db = await getDB()
        const tx = db.transaction("stocks", "readonly")
        const store = tx.objectStore("stocks")
        const allStocks = await store.getAllKeys()
        setStocks(allStocks as string[])
        if (allStocks.length > 0) {
          setSelectedStock(allStocks[0] as string)
        }
      } catch (error) {
        console.error("Error fetching stocks:", error)
        setMessage("Error loading stocks. Please check the console for details.")
      }
    }

    fetchStocks()
  }, [])

  // Handle stock selection change
  const handleStockChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedStock(e.target.value)
  }

  // Download stock data as CSV
  const handleDownload = async () => {
    if (!selectedStock) {
      setMessage("Please select a stock first.")
      return
    }

    setIsLoading(true)
    setMessage("")

    try {
      // Get stock data from IndexedDB
      const stockData = await getStockData(selectedStock)
      
      if (!stockData || stockData.length === 0) {
        setMessage(`No data available for ${selectedStock}.`)
        setIsLoading(false)
        return
      }

      // Convert to CSV
      const headers = Object.keys(stockData[0]).join(",")
      const rows = stockData.map(row => 
        Object.values(row).map(value => 
          typeof value === "string" && value.includes(",") 
            ? `"${value}"` 
            : value
        ).join(",")
      )
      const csvContent = [headers, ...rows].join("\n")

      // Create download link
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.setAttribute("href", url)
      link.setAttribute("download", `${selectedStock}_data.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      setMessage(`${selectedStock} data downloaded successfully.`)
    } catch (error) {
      console.error("Error downloading data:", error)
      setMessage("Error downloading data. Please check the console for details.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Layout title="Download Stock Data">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <h1 className="text-2xl md:text-3xl font-bold mb-6 text-navy-100">Download Stock Data</h1>
        
        <div className="bg-gradient-to-b from-navy-900/80 to-navy-800/80 border border-navy-700/30 rounded-lg p-6 shadow-lg">
          <div className="mb-6">
            <label htmlFor="stock-select" className="block text-navy-100 mb-2 font-medium">
              Select Stock
            </label>
            <Select
              id="stock-select"
              value={selectedStock}
              onChange={handleStockChange}
              disabled={stocks.length === 0 || isLoading}
            >
              {stocks.length === 0 ? (
                <option value="">No stocks available</option>
              ) : (
                stocks.map((stock) => (
                  <option key={stock} value={stock}>
                    {stock}
                  </option>
                ))
              )}
            </Select>
          </div>

          <Button 
            onClick={handleDownload} 
            disabled={!selectedStock || isLoading}
            primary
            className="w-full md:w-auto"
          >
            {isLoading ? "Preparing Download..." : "Download CSV"}
          </Button>

          {message && (
            <div className={`mt-4 p-3 rounded-md ${message.includes("Error") ? "bg-red-900/20 text-red-300" : "bg-green-900/20 text-green-300"}`}>
              {message}
            </div>
          )}

          <div className="mt-8 text-navy-300 text-sm">
            <h3 className="font-medium text-navy-200 mb-2">About Downloaded Data</h3>
            <p>The CSV file contains all historical price data stored in your browser for the selected stock. Data includes:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Date</li>
              <li>Symbol</li>
              <li>Open, High, Low, Close prices</li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  )
}
