"use client"

import { useState, useEffect } from "react"
import Head from "next/head"
import { Chart, registerables } from "chart.js"
import { Line } from "react-chartjs-2"
import "chartjs-adapter-luxon"
import { DateTime } from "luxon"

Chart.register(...registerables)

const PairAnalyzer = () => {
  const [tickerA, setTickerA] = useState("AAPL")
  const [tickerB, setTickerB] = useState("MSFT")
  const [pricesA, setPricesA] = useState([])
  const [pricesB, setPricesB] = useState([])
  const [hedgeRatios, setHedgeRatios] = useState([])
  const [alphas, setAlphas] = useState([])
  const [startDate, setStartDate] = useState("2023-01-01")
  const [endDate, setEndDate] = useState("2023-12-31")
  const [kalmanProcessNoise, setKalmanProcessNoise] = useState(0.0001) // Changed from 0.01
  const [kalmanMeasurementNoise, setKalmanMeasurementNoise] = useState(null) // Changed to null for adaptive
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Fetch data when component mounts or when tickers/dates change
    fetchData()
  }, [tickerA, tickerB, startDate, endDate])

  useEffect(() => {
    if (pricesA.length > 0 && pricesB.length > 0) {
      try {
        const { hedgeRatios, alphas } = kalmanFilter(pricesA, pricesB, kalmanProcessNoise, kalmanMeasurementNoise)
        setHedgeRatios(hedgeRatios)
        setAlphas(alphas)
      } catch (err) {
        setError(err.message)
        setHedgeRatios([])
        setAlphas([])
      }
    } else {
      setHedgeRatios([])
      setAlphas([])
    }
  }, [pricesA, pricesB, kalmanProcessNoise, kalmanMeasurementNoise])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const apiKey = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY
      if (!apiKey) {
        throw new Error("API key not found. Please set the NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY environment variable.")
      }

      const fetchPrices = async (ticker) => {
        const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${ticker}&outputsize=full&apikey=${apiKey}`
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Failed to fetch data for ${ticker}`)
        }
        const data = await response.json()

        if (!data["Time Series (Daily)"]) {
          throw new Error(`No data found for ${ticker}`)
        }

        return Object.entries(data["Time Series (Daily)"])
          .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()) // Sort by date
          .filter(([date]) => date >= startDate && date <= endDate) // Filter by date range
          .map(([date, values]) => ({
            date: DateTime.fromISO(date),
            close: values["4. close"],
          }))
      }

      const [dataA, dataB] = await Promise.all([fetchPrices(tickerA), fetchPrices(tickerB)])

      setPricesA(dataA)
      setPricesB(dataB)
    } catch (err) {
      setError(err.message)
      setPricesA([])
      setPricesB([])
      setHedgeRatios([])
      setAlphas([])
    } finally {
      setLoading(false)
    }
  }

  // Improved Kalman filter implementation following Gemini's approach
  const kalmanFilter = (pricesA, pricesB, processNoise = 0.0001, measurementNoise = null) => {
    const n = pricesA.length

    // Initialize with OLS regression from first 60 days (or available data)
    const initWindow = Math.min(60, Math.floor(n * 0.3))
    if (n < 10) {
      throw new Error("Insufficient data for Kalman filter initialization")
    }

    // Calculate initial OLS estimates
    let sumA = 0,
      sumB = 0,
      sumAB = 0,
      sumB2 = 0
    const initPricesA = []
    const initPricesB = []

    for (let i = 0; i < initWindow; i++) {
      const priceA = typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
      const priceB = typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close

      initPricesA.push(priceA)
      initPricesB.push(priceB)
      sumA += priceA
      sumB += priceB
      sumAB += priceA * priceB
      sumB2 += priceB * priceB
    }

    // Initial OLS estimates
    const meanA = sumA / initWindow
    const meanB = sumB / initWindow
    const numerator = initWindow * sumAB - sumA * sumB
    const denominator = initWindow * sumB2 - sumB * sumB

    if (Math.abs(denominator) < 1e-10) {
      throw new Error("Singular matrix in OLS initialization")
    }

    const initialBeta = numerator / denominator
    const initialAlpha = meanA - initialBeta * meanB

    // Calculate initial measurement noise from OLS residuals
    let residualSumSquares = 0
    for (let i = 0; i < initWindow; i++) {
      const predicted = initialAlpha + initialBeta * initPricesB[i]
      const residual = initPricesA[i] - predicted
      residualSumSquares += residual * residual
    }

    const adaptiveMeasurementNoise = measurementNoise || residualSumSquares / (initWindow - 2)

    // Initialize 2D state vector [alpha, beta]
    const x = [initialAlpha, initialBeta]

    // Initialize 2x2 covariance matrix
    let P = [
      [1.0, 0.0],
      [0.0, 1.0],
    ]

    // Process noise matrix Q (2x2)
    const Q = [
      [processNoise, 0.0],
      [0.0, processNoise],
    ]

    const hedgeRatios = []
    const alphas = []

    // Process each data point sequentially
    for (let i = 0; i < n; i++) {
      // Prediction step
      // x_pred = F * x (F is identity matrix, so x_pred = x)
      // P_pred = F * P * F' + Q (F is identity, so P_pred = P + Q)
      P[0][0] += Q[0][0]
      P[0][1] += Q[0][1]
      P[1][0] += Q[1][0]
      P[1][1] += Q[1][1]

      // Measurement
      const z = typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
      const priceB = typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close

      // Measurement model: z = H * x where H = [1, priceB]
      const H = [1.0, priceB]

      // Innovation: y = z - H * x
      const predicted = H[0] * x[0] + H[1] * x[1]
      const innovation = z - predicted

      // Innovation covariance: S = H * P * H' + R
      const HP = [
        H[0] * P[0][0] + H[1] * P[1][0], // H * P row 1
        H[0] * P[0][1] + H[1] * P[1][1], // H * P row 2
      ]
      const S = HP[0] * H[0] + HP[1] * H[1] + adaptiveMeasurementNoise

      // Check for numerical stability
      if (Math.abs(S) < 1e-10) {
        // Skip update if innovation covariance is too small
        hedgeRatios.push(x[1])
        alphas.push(x[0])
        continue
      }

      // Kalman gain: K = P * H' / S
      const K = [(P[0][0] * H[0] + P[0][1] * H[1]) / S, (P[1][0] * H[0] + P[1][1] * H[1]) / S]

      // State update: x = x + K * innovation
      x[0] = x[0] + K[0] * innovation
      x[1] = x[1] + K[1] * innovation

      // Covariance update: P = (I - K * H) * P
      const KH = [
        [K[0] * H[0], K[0] * H[1]],
        [K[1] * H[0], K[1] * H[1]],
      ]

      const newP = [
        [(1 - KH[0][0]) * P[0][0] - KH[0][1] * P[1][0], (1 - KH[0][0]) * P[0][1] - KH[0][1] * P[1][1]],
        [-KH[1][0] * P[0][0] + (1 - KH[1][1]) * P[1][0], -KH[1][0] * P[0][1] + (1 - KH[1][1]) * P[1][1]],
      ]

      P = newP

      // Ensure covariance matrix remains positive definite
      if (P[0][0] < 1e-10) P[0][0] = 1e-10
      if (P[1][1] < 1e-10) P[1][1] = 1e-10

      hedgeRatios.push(x[1]) // beta
      alphas.push(x[0]) // alpha
    }

    return { hedgeRatios, alphas }
  }

  const chartData = {
    labels: pricesA.map((price) => price.date.toFormat("yyyy-MM-dd")),
    datasets: [
      {
        label: `${tickerA} Price`,
        data: pricesA.map((price) => (typeof price.close === "string" ? Number.parseFloat(price.close) : price.close)),
        borderColor: "blue",
        fill: false,
      },
      {
        label: `${tickerB} Price`,
        data: pricesB.map((price) => (typeof price.close === "string" ? Number.parseFloat(price.close) : price.close)),
        borderColor: "red",
        fill: false,
      },
      {
        label: "Hedge Ratio",
        data: hedgeRatios,
        borderColor: "green",
        fill: false,
        yAxisID: "y-axis-hedge",
      },
      {
        label: "Alpha",
        data: alphas,
        borderColor: "purple",
        fill: false,
        yAxisID: "y-axis-alpha",
      },
    ],
  }

  const chartOptions = {
    scales: {
      x: {
        type: "time",
        time: {
          unit: "month",
        },
        adapters: {
          date: {
            locale: "en-US",
          },
        },
      },
      y: {
        type: "linear",
        position: "left",
      },
      "y-axis-hedge": {
        type: "linear",
        position: "right",
        grid: {
          drawOnChartArea: false,
        },
      },
      "y-axis-alpha": {
        type: "linear",
        position: "right",
        grid: {
          drawOnChartArea: false,
        },
      },
    },
    plugins: {
      title: {
        display: true,
        text: "Pair Analysis",
      },
    },
  }

  return (
    <div className="container">
      <Head>
        <title>Pair Analyzer</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="main">
        <h1 className="title">Pair Analyzer</h1>

        <div className="input-section">
          <div className="input-group">
            <label>Ticker A:</label>
            <input
              type="text"
              value={tickerA}
              onChange={(e) => setTickerA(e.target.value.toUpperCase())}
              className="input-field"
            />
          </div>
          <div className="input-group">
            <label>Ticker B:</label>
            <input
              type="text"
              value={tickerB}
              onChange={(e) => setTickerB(e.target.value.toUpperCase())}
              className="input-field"
            />
          </div>
          <div className="input-group">
            <label>Start Date:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input-field"
            />
          </div>
          <div className="input-group">
            <label>End Date:</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field" />
          </div>
        </div>

        <div className="input-section">
          <div className="input-group">
            <label>Kalman Process Noise:</label>
            <input
              type="number"
              value={kalmanProcessNoise}
              onChange={(e) => setKalmanProcessNoise(Number.parseFloat(e.target.value))}
              min="0.00001"
              max="0.01"
              step="0.00001" // Changed from 0.001
              className="input-field"
            />
          </div>
          <div className="input-group">
            <label>Kalman Measurement Noise:</label>
            <input
              type="number"
              value={kalmanMeasurementNoise === null ? "" : kalmanMeasurementNoise}
              onChange={(e) =>
                setKalmanMeasurementNoise(e.target.value === "" ? null : Number.parseFloat(e.target.value))
              }
              placeholder="Adaptive (leave blank)"
              className="input-field"
            />
          </div>
        </div>

        {loading && <p>Loading...</p>}
        {error && <p className="error">Error: {error}</p>}

        {pricesA.length > 0 && pricesB.length > 0 && hedgeRatios.length > 0 && alphas.length > 0 ? (
          <div className="chart-container">
            <Line data={chartData} options={chartOptions} />
          </div>
        ) : (
          !loading &&
          !error &&
          pricesA.length === 0 &&
          pricesB.length === 0 && <p>Enter ticker symbols and date range to see the analysis.</p>
        )}
      </main>

      <footer className="footer">
        <p>
          Powered by{" "}
          <a href="https://nextjs.org/" target="_blank" rel="noopener noreferrer">
            Next.js
          </a>{" "}
          and{" "}
          <a href="https://www.alphavantage.co/" target="_blank" rel="noopener noreferrer">
            Alpha Vantage
          </a>
        </p>
      </footer>
      <style jsx>{`
        .container {
          min-height: 100vh;
          padding: 0 0.5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        .main {
          padding: 5rem 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          width: 100%;
          max-width: 800px;
        }

        .footer {
          width: 100%;
          height: 100px;
          border-top: 1px solid #eaeaea;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .footer a {
          display: flex;
          justify-content: center;
          align-items: center;
          margin-left: 0.5rem;
        }

        .title {
          margin: 0;
          line-height: 1.15;
          font-size: 2.5rem;
          text-align: center;
        }

        .input-section {
          display: flex;
          flex-direction: column;
          width: 100%;
          margin-bottom: 1rem;
        }

        .input-group {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        label {
          margin-right: 1rem;
        }

        .input-field {
          padding: 0.5rem;
          border: 1px solid #ccc;
          border-radius: 4px;
          width: 60%;
        }

        .chart-container {
          width: 100%;
          margin-top: 2rem;
        }

        .error {
          color: red;
          margin-top: 1rem;
        }
      `}</style>

      <style jsx global>{`
        html,
        body {
          padding: 0;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Fira Sans,
            Droid Sans, Helvetica Neue, sans-serif;
        }

        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  )
}

export default PairAnalyzer
