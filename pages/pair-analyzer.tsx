"use client"

import { useState, useEffect } from "react"
import { openDB } from "idb"
import calculateZScoreExplicit from "../utils/calculations"
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
} from "recharts"

export default function PairAnalyzer() {
  const [stocks, setStocks] = useState([])
  const [selectedPair, setSelectedPair] = useState({ stockA: "", stockB: "" })
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [activeTab, setActiveTab] = useState("ratio") // 'ratio', 'ols', or 'kalman'

  // Shared parameters
  const [zScoreLookback, setZScoreLookback] = useState(30)

  // Trade parameters for practical half-life calculation
  const [entryThreshold, setEntryThreshold] = useState(2.0)
  const [exitThreshold, setExitThreshold] = useState(0.5)

  // Ratio model parameters
  const [ratioLookbackWindow, setRatioLookbackWindow] = useState(60)

  // OLS model parameters
  const [olsLookbackWindow, setOlsLookbackWindow] = useState(60)

  // Kalman filter parameters
  const [kalmanLookbackWindow, setKalmanLookbackWindow] = useState(60)
  const [kalmanProcessNoise, setKalmanProcessNoise] = useState(0.01)
  const [kalmanMeasurementNoise, setKalmanMeasurementNoise] = useState(0.1)

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
        const urlParams = new URLSearchParams(window.locatio
