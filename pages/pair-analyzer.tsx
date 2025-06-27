"use client"

import { useState, useEffect } from "react"
import { openDB } from "idb"
import { getCalculationsWorker, getRatioCalculationsWorker } from "../pages/_app" // Import both getter functions

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
  }, []) // Empty dependency array ensures this runs once on component mount

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

    console.log("Starting analysis for", activeTab, "model")

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

      console.log("Filtered data:", pricesA.length, "data points")

      if (activeTab === "ratio") {
        console.log("Using ratio calculations worker")
        // Use the ratio calculations worker
        const ratioWorker = getRatioCalculationsWorker()

        const ratioAnalysisPromise = new Promise((resolve, reject) => {
          const messageHandler = (event) => {
            console.log("Received message from ratio worker:", event.data.type)
            if (event.data.type === "ratioAnalysisComplete") {
              ratioWorker.removeEventListener("message", messageHandler)
              ratioWorker.removeEventListener("error", errorHandler)
              if (event.data.error) {
                console.error("Ratio worker error:", event.data.error)
                reject(new Error(event.data.error))
              } else {
                console.log("Ratio analysis completed successfully")
                resolve(event.data.analysisData)
              }
            } else if (event.data.type === "debug") {
              console.log("[Ratio Worker Debug]", event.data.message)
            } else if (event.data.type === "error") {
              console.error("[Ratio Worker Error]", event.data.message)
            }
          }

          const errorHandler = (e) => {
            console.error("Ratio worker error handler:", e)
            ratioWorker.removeEventListener("message", messageHandler)
            ratioWorker.removeEventListener("error", errorHandler)
            reject(new Error("An error occurred in the ratio analysis worker. Please check console for details."))
          }

          ratioWorker.addEventListener("message", messageHandler)
          ratioWorker.addEventListener("error", errorHandler)

          console.log("Sending data to ratio worker")
          ratioWorker.postMessage({
            type: "runRatioAnalysis",
            data: { pricesA, pricesB },
            params: { ratioLookbackWindow },
          })
        })

        const ratioResult = await ratioAnalysisPromise
        console.log("Got ratio result, now getting common stats")

        // Now get common statistics from the main worker
        const mainWorker = getCalculationsWorker()
        const statsPromise = new Promise((resolve, reject) => {
          const messageHandler = (event) => {
            console.log("Received message from main worker:", event.data.type)
            if (event.data.type === "analysisComplete") {
              mainWorker.removeEventListener("message", messageHandler)
              mainWorker.removeEventListener("error", errorHandler)
              if (event.data.error) {
                console.error("Main worker error:", event.data.error)
                reject(new Error(event.data.error))
              } else {
                console.log("Common stats completed successfully")
                resolve(event.data.analysisData)
              }
            } else if (event.data.type === "debug") {
              console.log("[Main Worker Debug]", event.data.message)
            } else if (event.data.type === "error") {
              console.error("[Main Worker Error]", event.data.message)
            }
          }

          const errorHandler = (e) => {
            console.error("Main worker error handler:", e)
            mainWorker.removeEventListener("message", messageHandler)
            mainWorker.removeEventListener("error", errorHandler)
            reject(new Error("An error occurred in the main stats worker. Please check console for details."))
          }

          mainWorker.addEventListener("message", messageHandler)
          mainWorker.addEventListener("error", errorHandler)

          console.log("Sending data to main worker for common stats")
          mainWorker.postMessage({
            type: "runCommonStats",
            data: { pricesA, pricesB },
            params: {
              modelType: activeTab,
              seriesForADF: ratioResult.ratios,
              zScores: ratioResult.zScores,
              entryThreshold,
              exitThreshold,
            },
            selectedPair: selectedPair,
          })
        })

        const commonStatsResult = await statsPromise

        // Combine results
        const finalAnalysisData = {
          ...ratioResult,
          statistics: {
            ...ratioResult.statistics,
            correlation: commonStatsResult.statistics.correlation,
            minZScore: commonStatsResult.statistics.minZScore,
            maxZScore: commonStatsResult.statistics.maxZScore,
            adfResults: commonStatsResult.statistics.adfResults,
            halfLife: commonStatsResult.statistics.halfLife,
            halfLifeValid: commonStatsResult.statistics.halfLifeValid,
            hurstExponent: commonStatsResult.statistics.hurstExponent,
            practicalTradeHalfLife: commonStatsResult.statistics.practicalTradeHalfLife,
          },
        }

        setAnalysisData(finalAnalysisData)
      } else {
        console.log("Using main calculations worker")
        // For OLS, Kalman, Euclidean, use the main calculations worker
        const mainWorker = getCalculationsWorker()
        const mainAnalysisPromise = new Promise((resolve, reject) => {
          const messageHandler = (event) => {
            console.log("Received message from main worker:", event.data.type)
            if (event.data.type === "analysisComplete") {
              mainWorker.removeEventListener("message", messageHandler)
              mainWorker.removeEventListener("error", errorHandler)
              if (event.data.error) {
                console.error("Main worker error:", event.data.error)
                reject(new Error(event.data.error))
              } else {
                console.log("Main analysis completed successfully")
                resolve(event.data.analysisData)
              }
            } else if (event.data.type === "debug") {
              console.log("[Main Worker Debug]", event.data.message)
            } else if (event.data.type === "error") {
              console.error("[Main Worker Error]", event.data.message)
            }
          }

          const errorHandler = (e) => {
            console.error("Main worker error handler:", e)
            mainWorker.removeEventListener("message", messageHandler)
            mainWorker.removeEventListener("error", errorHandler)
            reject(new Error("An error occurred in the main analysis worker. Please check console for details."))
          }

          mainWorker.addEventListener("message", messageHandler)
          mainWorker.addEventListener("error", errorHandler)

          console.log("Sending data to main worker")
          mainWorker.postMessage({
            type: "runAnalysis",
            data: { pricesA, pricesB },
            params: {
              modelType: activeTab,
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

        const result = await mainAnalysisPromise
        setAnalysisData(result)
      }

      setIsLoading(false)
      console.log("Analysis completed successfully")
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
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.correlation?.toFixed(4) || "N/A"}
                    </span>
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
                        ? analysisData.statistics.meanRatio?.toFixed(4) || "N/A"
                        : analysisData.statistics.modelType === "euclidean"
                          ? analysisData.statistics.meanDistance?.toFixed(4) || "N/A"
                          : analysisData.statistics.meanSpread?.toFixed(4) || "N/A"}
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
                        ? analysisData.statistics.stdDevRatio?.toFixed(4) || "N/A"
                        : analysisData.statistics.modelType === "euclidean"
                          ? analysisData.statistics.stdDevDistance?.toFixed(4) || "N/A"
                          : analysisData.statistics.stdDevSpread?.toFixed(4) || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Min Z-score:</span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.minZScore?.toFixed(4) || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Max Z-score:</span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.maxZScore?.toFixed(4) || "N/A"}
                    </span>
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
                        analysisData.statistics.practicalTradeHalfLife?.isValid ? "text-gold-400" : "text-red-400"
                      }`}
                    >
                      {analysisData.statistics.practicalTradeHalfLife?.isValid
                        ? `${analysisData.statistics.practicalTradeHalfLife.tradeCycleLength.toFixed(1)} (${(
                            analysisData.statistics.practicalTradeHalfLife.successRate * 100
                          ).toFixed(0)}% success)`
                        : "Insufficient data"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Hurst Exponent:</span>
                    <span className="text-gold-400 font-medium">
                      {analysisData.statistics.hurstExponent?.toFixed(4) || "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
