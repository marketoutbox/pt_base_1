"use client"

import { useState, useEffect } from "react"
import { openDB } from "idb"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
  BarChart,
  Bar,
} from "recharts"
import { getCalculationsWorker } from "../pages/_app" // Import the getter function for the shared worker

// Matrix operations for 2x2 matrices (these are no longer directly used in pair-analyzer.tsx, but kept for completeness if other parts of the app still use them)
const matrixMultiply2x2 = (A: number[][], B: number[][]): number[][] => {
  return [
    [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
    [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
  ]
}

const matrixMultiply2x1 = (A: number[][], b: number[]): number[] => {
  return [A[0][0] * b[0] + A[0][1] * b[1], A[1][0] * b[0] + A[1][1] * b[1]]
}

const matrixMultiply1x2 = (a: number[], B: number[][]): number[] => {
  return [a[0] * B[0][0] + a[1] * B[1][0], a[0] * B[0][1] + a[1] * B[1][1]]
}

const matrixTranspose2x2 = (A: number[][]): number[][] => {
  return [
    [A[0][0], A[1][0]],
    [A[0][1], A[1][1]],
  ]
}

const matrixAdd2x2 = (A: number[][], B: number[][]): number[][] => {
  return [
    [A[0][0] + B[0][0], A[0][1] + B[0][1]],
    [A[1][0] + B[1][0], A[1][1] + B[1][1]],
  ]
}

const matrixSubtract2x2 = (A: number[][], B: number[][]): number[][] => {
  return [
    [A[0][0] - B[0][0], A[0][1] - B[0][1]],
    [A[1][0] - B[1][0], A[1][1] - B[1][1]],
  ]
}

const matrixInverse2x2 = (A: number[][]): number[][] => {
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
  if (Math.abs(det) < 1e-10) {
    // Return identity matrix if singular
    return [
      [1, 0],
      [0, 1],
    ]
  }
  return [
    [A[1][1] / det, -A[0][1] / det],
    [-A[1][0] / det, A[0][0] / det],
  ]
}

const scalarInverse = (x: number): number => {
  return Math.abs(x) < 1e-10 ? 1.0 : 1.0 / x
}

export default function PairAnalyzer() {
  const [stocks, setStocks] = useState([])
  const [selectedPair, setSelectedPair] = useState({ stockA: "", stockB: "" })
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [activeTab, setActiveTab] = useState("ratio") // 'ratio', 'ols', 'kalman', or 'euclidean'

  // Shared parameters
  const [zScoreLookback, setZScoreLookback] = useState(30)

  // Trade parameters for practical half-life calculation
  const [entryThreshold, setEntryThreshold] = useState(2.0)
  const [exitThreshold, setExitThreshold] = useState(0.5)

  // Model-specific parameters
  const [ratioLookbackWindow, setRatioLookbackWindow] = useState(60)
  const [olsLookbackWindow, setOlsLookbackWindow] = useState(60)
  const [kalmanProcessNoise, setKalmanProcessNoise] = useState(0.0001)
  const [kalmanMeasurementNoise, setKalmanMeasurementNoise] = useState(1.0) // Note: This is currently unused in the worker's Kalman, but kept for UI consistency
  const [kalmanInitialLookback, setKalmanInitialLookback] = useState(60)
  const [euclideanLookbackWindow, setEuclideanLookbackWindow] = useState(60)

  const [plotType, setPlotType] = useState("line")
  const [isLoading, setIsLoading] = useState(false)
  const [analysisData, setAnalysisData] = useState(null)
  const [error, setError] = useState("")

  // No longer need a useRef for the worker, as it's managed globally
  // const workerRef = useRef<Worker | null>(null) // REMOVED

  useEffect(() => {
    const fetchStocks = async () => {
      try {
        const db = await openDB("StockDatabase", 2)
        const tx = db.transaction("stocks", "readonly")
        const store = tx.objectStore("stocks")
        const allStocks = await store.getAll()
        if (!allStocks.length) return
        setStocks(allStocks.map((stock) => stock.symbol))

        // Set default date range
        const today = new Date()
        const oneYearAgo = new Date()
        oneYearAgo.setFullYear(today.getFullYear() - 1)
        setFromDate(oneYearAgo.toISOString().split("T")[0])
        setToDate(today.toISOString().split("T")[0])

        // Check for URL parameters
        const urlParams = new URLSearchParams(window.location.search)
        const stockA = urlParams.get("stockA")
        const stockB = urlParams.get("stockB")

        if (stockA && stockB) {
          setSelectedPair({
            stockA,
            stockB,
          })
        }
      } catch (error) {
        console.error("Error fetching stocks:", error)
        setError("Failed to load stock data. Please try again.")
      }
    }
    fetchStocks()

    // The worker is now initialized globally in _app.tsx.
    // No need for worker initialization or cleanup here.
    // The global worker will be terminated when the app unmounts.
  }, [])

  const handleSelection = (event) => {
    const { name, value } = event.target
    setSelectedPair((prev) => ({ ...prev, [name]: value }))
  }

  const filterByDate = (data, from, to) => {
    return data
      .filter((entry) => entry.date >= from && entry.date <= to)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) // Sort by date in ascending order
  }

  const runAnalysis = async () => {
    if (!selectedPair.stockA || !selectedPair.stockB) {
      setError("Please select both stocks for analysis.")
      return
    }

    if (!fromDate || !toDate) {
      setError("Please select a date range for analysis.")
      return
    }

    setIsLoading(true)
    setError("")
    setAnalysisData(null) // Clear previous results

    try {
      const db = await openDB("StockDatabase", 2)
      const tx = db.transaction("stocks", "readonly")
      const store = tx.objectStore("stocks")
      const stockAData = await store.get(selectedPair.stockA)
      const stockBData = await store.get(selectedPair.stockB)

      if (!stockAData || !stockBData) {
        setError("Stock data not found. Please make sure you've fetched the data for both stocks.")
        setIsLoading(false)
        return
      }

      const pricesA = filterByDate(stockAData.data, fromDate, toDate)
      const pricesB = filterByDate(stockBData.data, fromDate, toDate)

      if (pricesA.length === 0 || pricesB.length === 0) {
        setError("No data available for the selected date range for one or both stocks.")
        setIsLoading(false)
        return
      }

      // Get the shared worker instance
      const worker = getCalculationsWorker()

      // Use a Promise to handle the worker's response for this specific analysis run
      const analysisPromise = new Promise((resolve, reject) => {
        const messageHandler = (event) => {
          if (event.data.type === "analysisComplete") {
            worker.removeEventListener("message", messageHandler) // Clean up listener
            worker.removeEventListener("error", errorHandler) // Clean up listener
            if (event.data.error) {
              reject(new Error(event.data.error))
            } else {
              resolve(event.data.analysisData)
            }
          } else if (event.data.type === "debug") {
            console.log("[Worker Debug]", event.data.message)
          } else if (event.data.type === "error") {
            console.error("[Worker Error]", event.data.message)
          }
        }

        const errorHandler = (e) => {
          worker.removeEventListener("message", messageHandler) // Clean up listener
          worker.removeEventListener("error", errorHandler) // Clean up listener
          reject(new Error("An error occurred in the background analysis. Please check console for details."))
        }

        worker.addEventListener("message", messageHandler)
        worker.addEventListener("error", errorHandler)

        // Send data and parameters to the worker
        worker.postMessage({
          type: "runAnalysis",
          data: { pricesA, pricesB },
          params: {
            modelType: activeTab,
            ratioLookbackWindow,
            olsLookbackWindow,
            kalmanProcessNoise,
            kalmanMeasurementNoise,
            kalmanInitialLookback,
            euclideanLookbackWindow,
            zScoreLookback,
            entryThreshold,
            exitThreshold,
          },
          selectedPair: selectedPair,
        })
      })

      const result = await analysisPromise
      setIsLoading(false)
      setAnalysisData(result)
    } catch (error) {
      console.error("Error initiating analysis:", error)
      setError(error.message || "An error occurred while preparing data for analysis. Please try again.")
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-bold text-white">Pair Analyzer</h1>
        <p className="text-xl text-gray-300">
          Analyze the statistical relationship between two stocks for pair trading
        </p>
      </div>

      <div className="card">
        <h2 className="text-2xl font-bold text-white mb-6">Analysis Parameters</h2>

        {error && <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-md text-red-300">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
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
        </div>

        {/* Tabs for different models */}
        <div className="mb-6">
          <div className="flex border-b border-navy-700">
            <button
              onClick={() => setActiveTab("ratio")}
              className={`px-4 py-2 font-medium ${
                activeTab === "ratio" ? "text-gold-400 border-b-2 border-gold-400" : "text-gray-300 hover:text-white"
              }`}
            >
              Ratio Model
            </button>
            <button
              onClick={() => setActiveTab("ols")}
              className={`px-4 py-2 font-medium ${
                activeTab === "ols" ? "text-gold-400 border-b-2 border-gold-400" : "text-gray-300 hover:text-white"
              }`}
            >
              OLS Spread Model
            </button>
            <button
              onClick={() => setActiveTab("kalman")}
              className={`px-4 py-2 font-medium ${
                activeTab === "kalman" ? "text-gold-400 border-b-2 border-gold-400" : "text-gray-300 hover:text-white"
              }`}
            >
              Kalman Spread Model
            </button>
            <button
              onClick={() => setActiveTab("euclidean")}
              className={`px-4 py-2 font-medium ${
                activeTab === "euclidean"
                  ? "text-gold-400 border-b-2 border-gold-400"
                  : "text-gray-300 hover:text-white"
              }`}
            >
              Euclidean Distance Model
            </button>
          </div>
        </div>

        {/* Model-specific parameters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {activeTab === "ratio" ? (
            <div>
              <label className="block text-base font-medium text-gray-300 mb-2">Ratio Lookback Window (Days)</label>
              <input
                type="number"
                value={ratioLookbackWindow}
                onChange={(e) => setRatioLookbackWindow(Number.parseInt(e.target.value))}
                min="10"
                max="252"
                className="input-field"
              />
              <p className="mt-1 text-sm text-gray-400">Window size for calculating ratio statistics and z-score</p>
            </div>
          ) : activeTab === "ols" ? (
            <>
              <div>
                <label className="block text-base font-medium text-gray-300 mb-2">OLS Lookback Window (Days)</label>
                <input
                  type="number"
                  value={olsLookbackWindow}
                  onChange={(e) => setOlsLookbackWindow(Number.parseInt(e.target.value))}
                  min="10"
                  max="252"
                  className="input-field"
                />
                <p className="mt-1 text-sm text-gray-400">Window size for rolling OLS regression</p>
              </div>
              <div>
                <label className="block text-base font-medium text-gray-300 mb-2">Z-Score Lookback (Days)</label>
                <input
                  type="number"
                  value={zScoreLookback}
                  onChange={(e) => setZScoreLookback(Number.parseInt(e.target.value))}
                  min="5"
                  max="100"
                  className="input-field"
                />
                <p className="mt-1 text-sm text-gray-400">Window size for z-score calculation</p>
              </div>
            </>
          ) : activeTab === "kalman" ? (
            <>
              <div>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className="block text-base font-medium text-gray-300 mb-2">Kalman Filter Parameters</label>
                    <p className="mt-1 text-sm text-gray-400">
                      Improved 2D Kalman filter tracks both alpha and beta. Process noise controls adaptation speed.
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Process Noise</label>
                        <input
                          type="number"
                          value={kalmanProcessNoise}
                          onChange={(e) => setKalmanProcessNoise(Number.parseFloat(e.target.value))}
                          min="0.00001"
                          max="0.01"
                          step="0.00001"
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Initial Lookback</label>
                        <input
                          type="number"
                          value={kalmanInitialLookback}
                          onChange={(e) => setKalmanInitialLookback(Number.parseInt(e.target.value))}
                          min="30"
                          max="120"
                          className="input-field"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-base font-medium text-gray-300 mb-2">Z-Score Lookback (Days)</label>
                <input
                  type="number"
                  value={zScoreLookback}
                  onChange={(e) => setZScoreLookback(Number.parseInt(e.target.value))}
                  min="5"
                  max="100"
                  className="input-field"
                />
                <p className="mt-1 text-sm text-gray-400">Window size for z-score calculation</p>
              </div>
            </>
          ) : (
            // Euclidean Distance Model Parameters
            <>
              <div>
                <label className="block text-base font-medium text-gray-300 mb-2">
                  Euclidean Lookback Window (Days)
                </label>
                <input
                  type="number"
                  value={euclideanLookbackWindow}
                  onChange={(e) => setEuclideanLookbackWindow(Number.parseInt(e.target.value))}
                  min="10"
                  max="252"
                  className="input-field"
                />
                <p className="mt-1 text-sm text-gray-400">
                  Window size for rolling mean and standard deviation of Euclidean Distance
                </p>
              </div>
              {/* Z-score lookback is implicitly tied to euclideanLookbackWindow for this model */}
              <div className="col-span-2">
                <p className="mt-1 text-sm text-gray-400">
                  Note: For the Euclidean model, the Z-score lookback is the same as the Euclidean Lookback Window.
                </p>
              </div>
            </>
          )}

          <div>
            <label className="block text-base font-medium text-gray-300 mb-2">Plot Type</label>
            <select value={plotType} onChange={(e) => setPlotType(e.target.value)} className="input-field">
              <option value="line">Line Chart</option>
              <option value="scatter">Scatter Plot</option>
              <option value="histogram">Histogram</option>
            </select>
            <p className="mt-1 text-sm text-gray-400">Type of visualization</p>
          </div>
        </div>

        {/* Trade parameters section */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-white mb-4">Trade Parameters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-base font-medium text-gray-300 mb-2">Entry Z-Score Threshold</label>
              <input
                type="number"
                value={entryThreshold}
                onChange={(e) => setEntryThreshold(Number.parseFloat(e.target.value))}
                min="1"
                max="4"
                step="0.1"
                className="input-field"
              />
              <p className="mt-1 text-sm text-gray-400">Z-score threshold for trade entry (absolute value)</p>
            </div>
            <div>
              <label className="block text-base font-medium text-gray-300 mb-2">Exit Z-Score Threshold</label>
              <input
                type="number"
                value={exitThreshold}
                onChange={(e) => setExitThreshold(Number.parseFloat(e.target.value))}
                min="0"
                max="2"
                step="0.1"
                className="input-field"
              />
              <p className="mt-1 text-sm text-gray-400">Z-score threshold for trade exit (absolute value)</p>
            </div>
          </div>
        </div>

        <div className="flex justify-center mt-8">
          <button onClick={runAnalysis} disabled={isLoading} className="btn-primary">
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
                Analyzing...
              </span>
            ) : (
              "Run Analysis"
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

      {analysisData && !isLoading && (
        <>
          <div className="card">
            <h2 className="text-2xl font-bold text-white mb-6">Analysis Results</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700">
                <h3 className="text-xl font-semibold text-white mb-4">Descriptive Statistics</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Correlation:</span>
                    <span className="text-gold-400 font-medium">{analysisData.statistics.correlation.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">
                      Mean{" "}
                      {analysisData.statistics.modelType === "ratio"
                        ? "Ratio"
                        : analysisData.statistics.modelType === "euclidean"
                          ? "Distance"
                          : "Spread"}
                      :
                    </span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.modelType === "ratio"
                        ? analysisData.statistics.meanRatio.toFixed(4)
                        : analysisData.statistics.modelType === "euclidean"
                          ? analysisData.statistics.meanDistance.toFixed(4)
                          : analysisData.statistics.meanSpread.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">
                      Std Dev{" "}
                      {analysisData.statistics.modelType === "ratio"
                        ? "Ratio"
                        : analysisData.statistics.modelType === "euclidean"
                          ? "Distance"
                          : "Spread"}
                      :
                    </span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.modelType === "ratio"
                        ? analysisData.statistics.stdDevRatio.toFixed(4)
                        : analysisData.statistics.modelType === "euclidean"
                          ? analysisData.statistics.stdDevDistance.toFixed(4)
                          : analysisData.statistics.stdDevSpread.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Min Z-score:</span>
                    <span className="text-gold-400 font-medium">{analysisData.statistics.minZScore.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Max Z-score:</span>
                    <span className="text-gold-400 font-medium">{analysisData.statistics.maxZScore.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Statistical Half-Life (days):</span>
                    <span
                      className={`font-medium ${analysisData.statistics.halfLifeValid ? "text-gold-400" : "text-red-400"}`}
                    >
                      {analysisData.statistics.halfLife > 0
                        ? `${analysisData.statistics.halfLife.toFixed(2)}${!analysisData.statistics.halfLifeValid ? " (Too slow)" : ""}`
                        : "Invalid"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Practical Trade Cycle (days):</span>
                    <span
                      className={`font-medium ${
                        analysisData.statistics.practicalTradeHalfLife.isValid ? "text-gold-400" : "text-red-400"
                      }`}
                    >
                      {analysisData.statistics.practicalTradeHalfLife.isValid
                        ? `${analysisData.statistics.practicalTradeHalfLife.tradeCycleLength.toFixed(1)} (${(
                            analysisData.statistics.practicalTradeHalfLife.successRate * 100
                          ).toFixed(0)}% success)`
                        : "Insufficient data"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Hurst Exponent:</span>
                    <span
                      className={`font-medium ${
                        analysisData.statistics.hurstExponent < 0.5
                          ? "text-green-400"
                          : analysisData.statistics.hurstExponent > 0.5
                            ? "text-red-400"
                            : "text-gold-400"
                      }`}
                    >
                      {analysisData.statistics.hurstExponent.toFixed(4)}
                      {analysisData.statistics.hurstExponent < 0.5
                        ? " (Mean-reverting)"
                        : analysisData.statistics.hurstExponent > 0.5
                          ? " (Trending)"
                          : " (Random)"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700">
                <h3 className="text-xl font-semibold text-white mb-4">ADF Test Results</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Test Statistic:</span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.adfResults.statistic.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">p-value:</span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.adfResults.pValue.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Critical Value (1%):</span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.adfResults.criticalValues["1%"]}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Critical Value (5%):</span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.adfResults.criticalValues["5%"]}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Stationarity:</span>
                    <span
                      className={`font-medium ${
                        analysisData.statistics.adfResults.isStationary ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {analysisData.statistics.adfResults.isStationary ? "Yes ✅" : "No ❌"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700 mb-8">
              <h3 className="text-xl font-semibold text-white mb-4">Pair Trading Recommendations</h3>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-navy-900/50 p-4 rounded-md border border-navy-700">
                    <h4 className="text-lg font-medium text-white mb-2">Pair Suitability</h4>
                    <div className="flex items-center">
                      <div
                        className={`w-3 h-3 rounded-full mr-2 ${
                          analysisData.statistics.correlation > 0.7 &&
                          analysisData.statistics.adfResults.isStationary &&
                          analysisData.statistics.halfLifeValid &&
                          analysisData.statistics.halfLife > 5 &&
                          analysisData.statistics.halfLife < 60 &&
                          analysisData.statistics.hurstExponent < 0.5
                            ? "bg-green-500"
                            : analysisData.statistics.correlation > 0.5 &&
                                analysisData.statistics.adfResults.isStationary
                              ? "bg-yellow-500"
                              : "bg-red-500"
                        }`}
                      ></div>
                      <span className="text-gray-300">
                        {analysisData.statistics.correlation > 0.7 &&
                        analysisData.statistics.adfResults.isStationary &&
                        analysisData.statistics.halfLifeValid &&
                        analysisData.statistics.halfLife > 5 &&
                        analysisData.statistics.halfLife < 60 &&
                        analysisData.statistics.hurstExponent < 0.5
                          ? "Excellent pair trading candidate"
                          : analysisData.statistics.correlation > 0.5 && analysisData.statistics.adfResults.isStationary
                            ? "Acceptable pair trading candidate"
                            : "Poor pair trading candidate"}
                      </span>
                    </div>
                  </div>

                  <div className="bg-navy-900/50 p-4 rounded-md border border-navy-700">
                    <h4 className="text-lg font-medium text-white mb-2">Current Signal</h4>
                    <div className="flex items-center">
                      {analysisData.zScores.length > 0 && (
                        <>
                          <div
                            className={`w-3 h-3 rounded-full mr-2 ${
                              analysisData.zScores[analysisData.zScores.length - 1] > 2
                                ? "bg-red-500"
                                : analysisData.zScores[analysisData.zScores.length - 1] < -2
                                  ? "bg-green-500"
                                  : "bg-gray-500"
                            }`}
                          ></div>
                          <span className="text-gray-300">
                            {analysisData.zScores[analysisData.zScores.length - 1] > 2
                              ? `Short ${selectedPair.stockA}, Long ${selectedPair.stockB} (Z-score: ${analysisData.zScores[analysisData.zScores.length - 1].toFixed(2)})`
                              : analysisData.zScores[analysisData.zScores.length - 1] < -2
                                ? `Long ${selectedPair.stockA}, Short ${selectedPair.stockB} (Z-score: ${analysisData.zScores[analysisData.zScores.length - 1].toFixed(2)})`
                                : "No trading signal (Z-score within normal range)"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-navy-900/50 p-4 rounded-md border border-navy-700">
                  <h4 className="text-lg font-medium text-white mb-2">Suggested Parameters</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <span className="text-gray-400 text-sm">Entry Z-score:</span>
                      <p className="text-white font-medium">
                        ±
                        {analysisData.statistics.modelType === "ratio"
                          ? analysisData.statistics.stdDevRatio > 0
                            ? "2.0"
                            : "N/A"
                          : analysisData.statistics.modelType === "euclidean"
                            ? analysisData.statistics.stdDevDistance > 0
                              ? "2.0"
                              : "N/A"
                            : analysisData.statistics.stdDevSpread > 0
                              ? "2.0"
                              : "N/A"}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">Exit Z-score:</span>
                      <p className="text-white font-medium">
                        ±
                        {analysisData.statistics.modelType === "ratio"
                          ? analysisData.statistics.stdDevRatio > 0
                            ? "0.5"
                            : "N/A"
                          : analysisData.statistics.modelType === "euclidean"
                            ? analysisData.statistics.stdDevDistance > 0
                              ? "0.5"
                              : "N/A"
                            : analysisData.statistics.stdDevSpread > 0
                              ? "0.5"
                              : "N/A"}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">Stop Loss Z-score:</span>
                      <p className="text-white font-medium">
                        ±
                        {analysisData.statistics.modelType === "ratio"
                          ? analysisData.statistics.stdDevRatio > 0
                            ? "3.0"
                            : "N/A"
                          : analysisData.statistics.modelType === "euclidean"
                            ? analysisData.statistics.stdDevDistance > 0
                              ? "3.0"
                              : "N/A"
                            : analysisData.statistics.stdDevSpread > 0
                              ? "3.0"
                              : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-navy-900/50 p-4 rounded-md border border-navy-700">
                  <h4 className="text-lg font-medium text-white mb-2">Position Sizing</h4>
                  <p className="text-gray-300 mb-2">For a market-neutral position with $10,000 total investment:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-gray-400 text-sm">{selectedPair.stockA} Position:</span>
                      <p className="text-white font-medium">
                        {analysisData.stockAPrices.length > 0
                          ? `${(5000).toFixed(2)} (${(5000 / analysisData.stockAPrices[analysisData.stockAPrices.length - 1]).toFixed(0)} shares)`
                          : "N/A"}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">{selectedPair.stockB} Position:</span>
                      <p className="text-white font-medium">
                        {analysisData.stockBPrices.length > 0 &&
                        (analysisData.hedgeRatios
                          ? analysisData.hedgeRatios.length > 0
                          : analysisData.ratios || analysisData.distances)
                          ? `${(5000).toFixed(2)} (${(
                              (5000 / analysisData.stockBPrices[analysisData.stockBPrices.length - 1]) *
                                (analysisData.statistics.modelType === "ols" ||
                                analysisData.statistics.modelType === "kalman"
                                  ? analysisData.hedgeRatios[analysisData.hedgeRatios.length - 1]
                                  : analysisData.stockAPrices[analysisData.stockAPrices.length - 1] /
                                    analysisData.stockBPrices[analysisData.stockBPrices.length - 1])
                            ).toFixed(0)} shares)`
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {analysisData.statistics.modelType !== "ratio" && analysisData.statistics.modelType !== "euclidean" && (
                <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700">
                  <h3 className="text-xl font-semibold text-white mb-4">Rolling Hedge Ratio Plot</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={analysisData.dates.map((date, i) => ({
                          date,
                          hedgeRatio: analysisData.hedgeRatios[i],
                        }))}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#dce5f3" }}
                          tickFormatter={(tick) => new Date(tick).toLocaleDateString()}
                          interval={Math.ceil(analysisData.dates.length / 10)}
                        />
                        <YAxis tick={{ fill: "#dce5f3" }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                          formatter={(value) => [value.toFixed(4), "Hedge Ratio (β)"]}
                          labelFormatter={(label) => new Date(label).toLocaleDateString()}
                        />
                        <Line type="monotone" dataKey="hedgeRatio" stroke="#ffd700" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-4 text-sm text-gray-400">
                    This chart shows how the hedge ratio (β) between {selectedPair.stockA} and {selectedPair.stockB}{" "}
                    evolves over time. A stable hedge ratio indicates a consistent relationship between the stocks.
                    {analysisData.statistics.modelType === "kalman" &&
                      " The improved Kalman filter provides more stable and accurate estimates."}
                  </p>
                </div>
              )}

              <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700">
                <h3 className="text-xl font-semibold text-white mb-4">
                  {analysisData.statistics.modelType === "ratio"
                    ? "Ratio Chart"
                    : analysisData.statistics.modelType === "euclidean"
                      ? "Euclidean Distance Chart"
                      : "Spread Chart"}
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    {plotType === "line" ? (
                      <LineChart
                        data={analysisData.dates.map((date, i) => ({
                          date,
                          value:
                            analysisData.statistics.modelType === "ratio"
                              ? analysisData.ratios[i]
                              : analysisData.statistics.modelType === "euclidean"
                                ? analysisData.distances[i]
                                : analysisData.spreads[i],
                          mean: analysisData.chartData.rollingMean[i],
                          upperBand1: analysisData.chartData.rollingUpperBand1[i],
                          lowerBand1: analysisData.chartData.rollingLowerBand1[i],
                          upperBand2: analysisData.chartData.rollingUpperBand2[i],
                          lowerBand2: analysisData.chartData.rollingLowerBand2[i],
                        }))}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#dce5f3" }}
                          tickFormatter={(tick) => new Date(tick).toLocaleDateString()}
                          interval={Math.ceil(analysisData.dates.length / 10)}
                        />
                        <YAxis tick={{ fill: "#dce5f3" }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                          formatter={(value) => [value.toFixed(4), "Value"]}
                          labelFormatter={(label) => new Date(label).toLocaleDateString()}
                        />
                        <Line type="monotone" dataKey="value" stroke="#ffd700" dot={false} />
                        <Line type="monotone" dataKey="mean" stroke="#ffffff" dot={false} strokeDasharray="5 5" />
                        <Line type="monotone" dataKey="upperBand1" stroke="#3a4894" dot={false} strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="lowerBand1" stroke="#3a4894" dot={false} strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="upperBand2" stroke="#ff6b6b" dot={false} strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="lowerBand2" stroke="#ff6b6b" dot={false} strokeDasharray="3 3" />
                      </LineChart>
                    ) : plotType === "scatter" ? (
                      <ScatterChart
                        data={analysisData.dates.map((date, i) => ({
                          date: i, // Use index for x-axis
                          value:
                            analysisData.statistics.modelType === "ratio"
                              ? analysisData.ratios[i]
                              : analysisData.statistics.modelType === "euclidean"
                                ? analysisData.distances[i]
                                : analysisData.spreads[i],
                        }))}
                        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                        <XAxis
                          type="number"
                          dataKey="date"
                          name="Time"
                          tick={{ fill: "#dce5f3" }}
                          label={{ value: "Time (Days)", position: "insideBottomRight", fill: "#dce5f3" }}
                        />
                        <YAxis
                          type="number"
                          dataKey="value"
                          name="Value"
                          tick={{ fill: "#dce5f3" }}
                          label={{
                            value:
                              analysisData.statistics.modelType === "ratio"
                                ? "Ratio"
                                : analysisData.statistics.modelType === "euclidean"
                                  ? "Distance"
                                  : "Spread",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#dce5f3",
                          }}
                        />
                        <ZAxis range={[15, 15]} />
                        <Tooltip
                          cursor={{ strokeDasharray: "3 3" }}
                          contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                          formatter={(value) => [
                            value.toFixed(4),
                            analysisData.statistics.modelType === "ratio"
                              ? "Ratio"
                              : analysisData.statistics.modelType === "euclidean"
                                ? "Distance"
                                : "Spread",
                          ]}
                        />
                        <Scatter
                          name={
                            analysisData.statistics.modelType === "ratio"
                              ? "Ratio"
                              : analysisData.statistics.modelType === "euclidean"
                                ? "Distance"
                                : "Spread"
                          }
                          data={analysisData.dates.map((date, i) => ({
                            date: i,
                            value:
                              analysisData.statistics.modelType === "ratio"
                                ? analysisData.ratios[i]
                                : analysisData.statistics.modelType === "euclidean"
                                  ? analysisData.distances[i]
                                  : analysisData.spreads[i],
                          }))}
                          fill="#ffd700"
                        />
                      </ScatterChart>
                    ) : (
                      // Histogram
                      (() => {
                        const data =
                          analysisData.statistics.modelType === "ratio"
                            ? analysisData.ratios
                            : analysisData.statistics.modelType === "euclidean"
                              ? analysisData.distances
                              : analysisData.spreads
                        const min = Math.min(...data)
                        const max = Math.max(...data)
                        const binCount = 20
                        const binSize = (max - min) / binCount

                        const bins = Array(binCount)
                          .fill(0)
                          .map((_, i) => ({
                            range: `${(min + i * binSize).toFixed(3)}-${(min + (i + 1) * binSize).toFixed(3)}`,
                            count: 0,
                            midpoint: min + (i + 0.5) * binSize,
                          }))

                        data.forEach((value) => {
                          const binIndex = Math.min(Math.floor((value - min) / binSize), binCount - 1)
                          bins[binIndex].count++
                        })

                        return (
                          <BarChart data={bins} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                            <XAxis
                              dataKey="midpoint"
                              tick={{ fill: "#dce5f3", fontSize: 10 }}
                              tickFormatter={(value) => value.toFixed(2)}
                              interval={Math.floor(binCount / 5)}
                            />
                            <YAxis tick={{ fill: "#dce5f3" }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                              formatter={(value) => [value, "Frequency"]}
                              labelFormatter={(label) => `Range: ${label.toFixed(3)}`}
                            />
                            <Bar dataKey="count" fill="#ffd700" />
                          </BarChart>
                        )
                      })()
                    )}
                  </ResponsiveContainer>
                </div>
                <p className="mt-4 text-sm text-gray-400">
                  This chart shows the{" "}
                  {analysisData.statistics.modelType === "ratio"
                    ? "ratio"
                    : analysisData.statistics.modelType === "euclidean"
                      ? "Euclidean distance"
                      : "spread"}{" "}
                  between {selectedPair.stockA} and {selectedPair.stockB}
                  {plotType === "line"
                    ? " with rolling mean and standard deviation bands."
                    : plotType === "scatter"
                      ? " as a scatter plot over time."
                      : " distribution statistics."}
                  {plotType === "line" && " Mean-reverting behavior is ideal for pair trading."}
                </p>
              </div>

              {/* Chart 2: Z-Score Chart */}
              <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700">
                <h3 className="text-xl font-semibold text-white mb-4">Z-Score Chart</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    {plotType === "line" ? (
                      <LineChart
                        data={analysisData.dates.map((date, i) => ({
                          date,
                          zScore: analysisData.zScores[i],
                        }))}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#dce5f3" }}
                          tickFormatter={(tick) => new Date(tick).toLocaleDateString()}
                          interval={Math.ceil(analysisData.dates.length / 10)}
                        />
                        <YAxis tick={{ fill: "#dce5f3" }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                          formatter={(value) => [value.toFixed(4), "Z-Score"]}
                          labelFormatter={(label) => new Date(label).toLocaleDateString()}
                        />
                        <ReferenceLine y={0} stroke="#ffffff" />
                        <ReferenceLine y={1} stroke="#3a4894" strokeDasharray="3 3" />
                        <ReferenceLine y={-1} stroke="#3a4894" strokeDasharray="3 3" />
                        <ReferenceLine y={2} stroke="#ff6b6b" strokeDasharray="3 3" />
                        <ReferenceLine y={-2} stroke="#ff6b6b" strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="zScore" stroke="#ffd700" dot={false} strokeWidth={2} />
                      </LineChart>
                    ) : plotType === "scatter" ? (
                      <ScatterChart
                        data={analysisData.dates.map((date, i) => ({
                          date: i,
                          zScore: analysisData.zScores[i],
                        }))}
                        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                        <XAxis
                          type="number"
                          dataKey="date"
                          name="Time"
                          tick={{ fill: "#dce5f3" }}
                          label={{ value: "Time (Days)", position: "insideBottomRight", fill: "#dce5f3" }}
                        />
                        <YAxis
                          type="number"
                          dataKey="zScore"
                          name="Z-Score"
                          tick={{ fill: "#dce5f3" }}
                          label={{ value: "Z-Score", angle: -90, position: "insideLeft", fill: "#dce5f3" }}
                        />
                        <ZAxis range={[15, 15]} />
                        <Tooltip
                          cursor={{ strokeDasharray: "3 3" }}
                          contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                          formatter={(value) => [value.toFixed(4), "Z-Score"]}
                        />
                        <ReferenceLine y={0} stroke="#ffffff" />
                        <ReferenceLine y={2} stroke="#ff6b6b" strokeDasharray="3 3" />
                        <ReferenceLine y={-2} stroke="#ff6b6b" strokeDasharray="3 3" />
                        <Scatter
                          name="Z-Score"
                          data={analysisData.dates.map((date, i) => ({
                            date: i,
                            zScore: analysisData.zScores[i],
                          }))}
                          fill="#ffd700"
                        />
                      </ScatterChart>
                    ) : (
                      // Histogram
                      (() => {
                        const data = analysisData.zScores.filter((z) => !isNaN(z))
                        const min = Math.min(...data)
                        const max = Math.max(...data)
                        const binCount = 20
                        const binSize = (max - min) / binCount

                        const bins = Array(binCount)
                          .fill(0)
                          .map((_, i) => ({
                            range: `${(min + i * binSize).toFixed(2)}-${(min + (i + 1) * binSize).toFixed(2)}`,
                            count: 0,
                            midpoint: min + (i + 0.5) * binSize,
                          }))

                        data.forEach((value) => {
                          const binIndex = Math.min(Math.floor((value - min) / binSize), binCount - 1)
                          bins[binIndex].count++
                        })

                        return (
                          <BarChart data={bins} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                            <XAxis
                              dataKey="midpoint"
                              tick={{ fill: "#dce5f3", fontSize: 10 }}
                              tickFormatter={(value) => value.toFixed(1)}
                              interval={Math.floor(binCount / 5)}
                            />
                            <YAxis tick={{ fill: "#dce5f3" }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                              formatter={(value) => [value, "Frequency"]}
                              labelFormatter={(label) => `Z-Score: ${label.toFixed(2)}`}
                            />
                            <ReferenceLine x={0} stroke="#ffffff" strokeDasharray="3 3" />
                            <ReferenceLine x={2} stroke="#ff6b6b" strokeDasharray="3 3" />
                            <ReferenceLine x={-2} stroke="#ff6b6b" strokeDasharray="3 3" />
                            <Bar dataKey="count" fill="#ffd700" />
                          </BarChart>
                        )
                      })()
                    )}
                  </ResponsiveContainer>
                </div>
                <p className="mt-4 text-sm text-gray-400">
                  This chart shows the z-score of the{" "}
                  {analysisData.statistics.modelType === "ratio"
                    ? "ratio"
                    : analysisData.statistics.modelType === "euclidean"
                      ? "Euclidean distance"
                      : "spread"}
                  {plotType === "line"
                    ? ", highlighting regions where z-score > 2 or < -2. These extreme values indicate potential trading opportunities."
                    : plotType === "scatter"
                      ? " as a scatter plot over time, showing the distribution of z-scores."
                      : " distribution statistics, showing how often extreme values occur."}
                </p>
              </div>

              {/* Chart 3: Price Chart */}
              <div className="bg-navy-800/50 p-6 rounded-lg border border-navy-700">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Price Chart: {selectedPair.stockA} vs {selectedPair.stockB}
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    {plotType === "line" ? (
                      <LineChart
                        data={analysisData.dates.map((date, i) => ({
                          date,
                          stockA: analysisData.stockAPrices[i],
                          stockB: analysisData.stockBPrices[i],
                          ...(analysisData.statistics.modelType === "euclidean" && {
                            normalizedA: analysisData.normalizedPricesA[i],
                            normalizedB: analysisData.normalizedPricesB[i],
                          }),
                        }))}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#dce5f3" }}
                          tickFormatter={(tick) => new Date(tick).toLocaleDateString()}
                          interval={Math.ceil(analysisData.dates.length / 10)}
                        />
                        <YAxis yAxisId="left" tick={{ fill: "#dce5f3" }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fill: "#dce5f3" }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                          formatter={(value, name) => [value.toFixed(2), name]}
                          labelFormatter={(label) => new Date(label).toLocaleDateString()}
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="stockA"
                          stroke="#ffd700"
                          dot={false}
                          name={selectedPair.stockA}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="stockB"
                          stroke="#ff6b6b"
                          dot={false}
                          name={selectedPair.stockB}
                        />
                        {analysisData.statistics.modelType === "euclidean" && (
                          <>
                            <Line
                              yAxisId="left"
                              type="monotone"
                              dataKey="normalizedA"
                              stroke="#00bfff" // Light blue for normalized A
                              dot={false}
                              name={`${selectedPair.stockA} (Normalized)`}
                              strokeDasharray="5 5"
                            />
                            <Line
                              yAxisId="right"
                              type="monotone"
                              dataKey="normalizedB"
                              stroke="#90ee90" // Light green for normalized B
                              dot={false}
                              name={`${selectedPair.stockB} (Normalized)`}
                              strokeDasharray="5 5"
                            />
                          </>
                        )}
                      </LineChart>
                    ) : plotType === "scatter" ? (
                      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                        <XAxis
                          type="number"
                          dataKey="stockB"
                          name={selectedPair.stockB}
                          tick={{ fill: "#dce5f3" }}
                          label={{ value: selectedPair.stockB, position: "insideBottomRight", fill: "#dce5f3" }}
                        />
                        <YAxis
                          type="number"
                          dataKey="stockA"
                          name={selectedPair.stockA}
                          tick={{ fill: "#dce5f3" }}
                          label={{ value: selectedPair.stockA, angle: -90, position: "insideLeft", fill: "#dce5f3" }}
                        />
                        <ZAxis range={[15, 15]} />
                        <Tooltip
                          cursor={{ strokeDasharray: "3 3" }}
                          contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                          formatter={(value) => [value.toFixed(2), ""]}
                        />
                        <Scatter
                          name="Stock Prices"
                          data={analysisData.stockAPrices.map((priceA, i) => ({
                            stockA: priceA,
                            stockB: analysisData.stockBPrices[i],
                            date: analysisData.dates[i],
                          }))}
                          fill="#ffd700"
                        />
                        {/* Add regression line for OLS/Kalman models */}
                        {(() => {
                          if (
                            (analysisData.statistics.modelType === "ols" ||
                              analysisData.statistics.modelType === "kalman") &&
                            analysisData.stockBPrices.length > 0
                          ) {
                            const lastBeta = analysisData.hedgeRatios[analysisData.hedgeRatios.length - 1]
                            const lastAlpha = analysisData.alphas[analysisData.alphas.length - 1]
                            const minB = Math.min(...analysisData.stockBPrices)
                            const maxB = Math.max(...analysisData.stockBPrices)

                            return (
                              <Line
                                type="linear"
                                dataKey="stockA"
                                data={[
                                  { stockB: minB, stockA: lastAlpha + lastBeta * minB },
                                  { stockB: maxB, stockA: lastAlpha + lastBeta * maxB },
                                ]}
                                stroke="#ff6b6b"
                                strokeWidth={2}
                                dot={false}
                                activeDot={false}
                                legendType="none"
                              />
                            )
                          }
                          return null
                        })()}
                      </ScatterChart>
                    ) : (
                      // Histogram
                      (() => {
                        const createBins = (data, binCount = 15) => {
                          const min = Math.min(...data)
                          const max = Math.max(...data)
                          const binSize = (max - min) / binCount

                          const bins = Array(binCount)
                            .fill(0)
                            .map((_, i) => ({
                              midpoint: min + (i + 0.5) * binSize,
                              count: 0,
                            }))

                          data.forEach((value) => {
                            const binIndex = Math.min(Math.floor((value - min) / binSize), binCount - 1)
                            bins[binIndex].count++
                          })

                          return bins
                        }

                        const binsA = createBins(analysisData.stockAPrices)
                        const binsB = createBins(analysisData.stockBPrices)

                        // Combine bins for side-by-side display
                        const combinedData = []
                        const maxLength = Math.max(binsA.length, binsB.length)

                        for (let i = 0; i < maxLength; i++) {
                          combinedData.push({
                            index: i,
                            [`${selectedPair.stockA}`]: binsA[i]?.count || 0,
                            [`${selectedPair.stockB}`]: binsB[i]?.count || 0,
                            priceA: binsA[i]?.midpoint || 0,
                            priceB: binsB[i]?.midpoint || 0,
                          })
                        }

                        return (
                          <BarChart data={combinedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" />
                            <XAxis
                              dataKey="index"
                              tick={{ fill: "#dce5f3", fontSize: 10 }}
                              label={{ value: "Price Bins", position: "insideBottomRight", fill: "#dce5f3" }}
                            />
                            <YAxis tick={{ fill: "#dce5f3" }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894", color: "#dce5f3" }}
                              formatter={(value, name) => [value, `${name} Frequency`]}
                              labelFormatter={(label) => `Bin ${label}`}
                            />
                            <Bar dataKey={selectedPair.stockA} fill="#ffd700" />
                            <Bar dataKey={selectedPair.stockB} fill="#ff6b6b" />
                          </BarChart>
                        )
                      })()
                    )}
                  </ResponsiveContainer>
                </div>
                <p className="mt-4 text-sm text-gray-400">
                  This chart shows{" "}
                  {plotType === "line"
                    ? "both stock prices over time with dual Y-axes"
                    : plotType === "scatter"
                      ? "the relationship between the two stock prices"
                      : "the price distribution statistics for both stocks"}
                  {analysisData.statistics.modelType !== "ratio" && plotType === "scatter"
                    ? " with a regression line based on the latest regression."
                    : "."}
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-2xl font-bold text-white mb-6">
              Complete Data Table ({analysisData.tableData.length} Days)
            </h2>
            <div className="overflow-x-auto">
              <div className="max-h-[500px] overflow-y-auto">
                <table className="min-w-full divide-y divide-navy-700">
                  <thead className="bg-navy-800">
                    <tr>
                      <th className="table-header">Date</th>
                      <th className="table-header">{selectedPair.stockA} Price</th>
                      <th className="table-header">{selectedPair.stockB} Price</th>
                      {analysisData.statistics.modelType === "euclidean" && (
                        <>
                          <th className="table-header">Normalized {selectedPair.stockA}</th>
                          <th className="table-header">Normalized {selectedPair.stockB}</th>
                        </>
                      )}
                      {analysisData.statistics.modelType !== "ratio" &&
                        analysisData.statistics.modelType !== "euclidean" && (
                          <>
                            <th className="table-header">Alpha (α)</th>
                            <th className="table-header">Hedge Ratio (β)</th>
                          </>
                        )}
                      <th className="table-header">
                        {analysisData.statistics.modelType === "ratio"
                          ? "Ratio"
                          : analysisData.statistics.modelType === "euclidean"
                            ? "Distance"
                            : "Spread"}
                      </th>
                      <th className="table-header">Z-score</th>
                      <th className="table-header">Half-Life</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-800">
                    {analysisData.tableData.map((row, index) => (
                      <tr key={index} className={index % 2 === 0 ? "bg-navy-900/50" : "bg-navy-900/30"}>
                        <td className="table-cell">{row.date}</td>
                        <td className="table-cell">{row.priceA.toFixed(2)}</td>
                        <td className="table-cell">{row.priceB.toFixed(2)}</td>
                        {analysisData.statistics.modelType === "euclidean" && (
                          <>
                            <td className="table-cell">{row.normalizedA.toFixed(4)}</td>
                            <td className="table-cell">{row.normalizedB.toFixed(4)}</td>
                          </>
                        )}
                        {analysisData.statistics.modelType !== "ratio" &&
                          analysisData.statistics.modelType !== "euclidean" && (
                            <>
                              <td className="table-cell">{row.alpha.toFixed(4)}</td>
                              <td className="table-cell">{row.hedgeRatio.toFixed(4)}</td>
                            </>
                          )}
                        <td className="table-cell">
                          {analysisData.statistics.modelType === "ratio"
                            ? row.ratio.toFixed(4)
                            : analysisData.statistics.modelType === "euclidean"
                              ? row.distance.toFixed(4)
                              : row.spread.toFixed(4)}
                        </td>
                        <td
                          className={`table-cell font-medium ${
                            row.zScore > 2 || row.zScore < -2
                              ? "text-gold-400"
                              : row.zScore > 1 || row.zScore < -1
                                ? "text-gold-400/70"
                                : "text-white"
                          }`}
                        >
                          {row.zScore.toFixed(4)}
                        </td>
                        <td className="table-cell">{row.halfLife || "N/A"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
