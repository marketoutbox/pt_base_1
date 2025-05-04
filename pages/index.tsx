"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
import { ArrowRight, TrendingDown, TrendingUp, BarChart2, Shield, Zap, Clock, MessageCircle, Phone } from "lucide-react"

export default function Home() {
  const [isClient, setIsClient] = useState(false)
  const [activeTab, setActiveTab] = useState("what")
  const [animationStep, setAnimationStep] = useState(0)

  // Sample data for the different chart types
  const generateSampleData = (step) => {
    // Different data generation based on chart type
    if (step === 0) {
      // Correlated Pair - two price lines moving closely together
      const data = []
      const baseValue = 100

      for (let i = 0; i < 30; i++) {
        // Create two closely correlated price series
        const commonTrend = Math.sin(i * 0.3) * 10
        const stockA = baseValue + commonTrend + Math.random() * 3
        const stockB = baseValue * 0.8 + commonTrend * 0.9 + Math.random() * 3

        data.push({
          day: i,
          stockA,
          stockB,
          correlation: 0.92,
        })
      }
      return data
    } else if (step === 1) {
      // Z-Score Chart
      const data = []

      for (let i = 0; i < 30; i++) {
        // Create a z-score series that shows mean reversion
        let zScore
        if (i < 10) {
          zScore = Math.sin(i * 0.5) * 1.2
        } else if (i < 15) {
          zScore = 1.5 + (i - 10) * 0.3 // Rising above threshold
        } else if (i < 25) {
          zScore = 3 - (i - 15) * 0.1 // Slowly falling
        } else {
          zScore = 2 - (i - 25) * 0.5 // Rapid mean reversion
        }

        data.push({
          day: i,
          zScore,
        })
      }
      return data
    } else {
      // OLS Regression Spread Chart
      const data = []
      const baseValue = 100

      for (let i = 0; i < 30; i++) {
        // Create price series and calculated spread
        const stockA = baseValue + Math.sin(i * 0.3) * 10 + i * 0.5
        const stockB = baseValue * 0.8 + Math.sin(i * 0.3) * 8 + i * 0.4

        // Calculate regression parameters (simplified)
        const beta = 1.2
        const alpha = 5

        // Calculate spread
        const spread = stockA - (alpha + beta * stockB)

        data.push({
          day: i,
          stockA,
          stockB,
          spread,
          predictedA: alpha + beta * stockB,
        })
      }
      return data
    }
  }

  const [chartData, setChartData] = useState([])

  // Cycle through animation steps
  useEffect(() => {
    setIsClient(true)

    const timer = setInterval(() => {
      setAnimationStep((prev) => (prev + 1) % 3)
    }, 5000)

    return () => clearInterval(timer)
  }, [])

  // Update chart data when animation step changes
  useEffect(() => {
    if (isClient) {
      setChartData(generateSampleData(animationStep))
    }
  }, [animationStep, isClient])

  // Sample testimonials
  const testimonials = [
    {
      quote: "This platform helped me identify profitable pair trades I would have otherwise missed.",
      author: "Sarah K., Quantitative Trader",
    },
    {
      quote: "The backtesting tools saved me countless hours of analysis and improved my strategy performance.",
      author: "Michael R., Portfolio Manager",
    },
    {
      quote: "The statistical analysis tools are powerful yet intuitive. Perfect for both beginners and pros.",
      author: "David L., Hedge Fund Analyst",
    },
  ]

  // Sample statistics
  const statistics = [
    { label: "Pairs Analyzed", value: "10,000+" },
    { label: "Success Rate", value: "68%" },
    { label: "Avg. Annual Return", value: "14.2%" },
    { label: "Market Neutrality", value: "97%" },
  ]

  return (
    <div className="space-y-16">
      {/* Hero Section */}
      <section className="gradient-border my-8">
        <div className="gradient-border-content py-16 px-6 md:px-10 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h1 className="text-5xl md:text-6xl font-bold">
                <span className="text-white">Statistical Edge in</span>
                <span className="gold-gradient-text block mt-2">Pair Trading</span>
              </h1>

              <p className="text-xl text-gray-300 leading-relaxed">
                Identify market-neutral opportunities with advanced statistical analysis. Our platform helps you find,
                analyze, and backtest pair trading strategies with precision.
              </p>

              <div className="pt-4 flex flex-wrap gap-4">
                <Link href="/pair-analyzer" className="btn-primary">
                  Start Analyzing <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
                <Link href="/backtest" className="btn-secondary">
                  Try Backtesting
                </Link>
              </div>
            </div>

            {isClient && (
              <div className="bg-navy-900/80 p-6 rounded-xl border border-navy-700 shadow-xl">
                <div className="mb-4 flex justify-between items-center">
                  <div>
                    <span className="text-sm text-gray-400">Chart Type:</span>
                    <h3 className="text-lg font-medium text-white">
                      {animationStep === 0
                        ? "Correlated Pair"
                        : animationStep === 1
                          ? "Z-Score Analysis"
                          : "OLS Regression Spread"}
                    </h3>
                  </div>
                  <div className="flex space-x-2">
                    {[0, 1, 2].map((step) => (
                      <button
                        key={step}
                        onClick={() => setAnimationStep(step)}
                        className={`w-3 h-3 rounded-full ${animationStep === step ? "bg-gold-400" : "bg-navy-700"}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    {animationStep === 0 ? (
                      // Correlated Pair Chart
                      <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" opacity={0.3} />
                        <XAxis dataKey="day" tick={{ fill: "#dce5f3" }} />
                        <YAxis tick={{ fill: "#dce5f3" }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894" }}
                          labelFormatter={(value) => `Day ${value}`}
                        />
                        <Line
                          type="monotone"
                          dataKey="stockA"
                          name="Stock A"
                          stroke="#ffd700"
                          dot={false}
                          strokeWidth={2}
                        />
                        <Line
                          type="monotone"
                          dataKey="stockB"
                          name="Stock B"
                          stroke="#3a4894"
                          dot={false}
                          strokeWidth={2}
                        />
                      </LineChart>
                    ) : animationStep === 1 ? (
                      // Z-Score Chart
                      <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" opacity={0.3} />
                        <XAxis dataKey="day" tick={{ fill: "#dce5f3" }} />
                        <YAxis tick={{ fill: "#dce5f3" }} domain={[-3, 3]} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894" }}
                          labelFormatter={(value) => `Day ${value}`}
                        />
                        <ReferenceLine y={0} stroke="#ffffff" />
                        <ReferenceLine y={2} stroke="#ff6b6b" strokeDasharray="3 3" />
                        <ReferenceLine y={-2} stroke="#ff6b6b" strokeDasharray="3 3" />
                        <Line
                          type="monotone"
                          dataKey="zScore"
                          name="Z-Score"
                          stroke="#ffd700"
                          dot={false}
                          strokeWidth={2}
                        />
                      </LineChart>
                    ) : (
                      // OLS Regression Spread Chart
                      <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a4894" opacity={0.3} />
                        <XAxis dataKey="day" tick={{ fill: "#dce5f3" }} />
                        <YAxis tick={{ fill: "#dce5f3" }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#192042", borderColor: "#3a4894" }}
                          labelFormatter={(value) => `Day ${value}`}
                        />
                        <Line
                          type="monotone"
                          dataKey="stockA"
                          name="Stock A"
                          stroke="#ffd700"
                          dot={false}
                          strokeWidth={2}
                        />
                        <Line
                          type="monotone"
                          dataKey="predictedA"
                          name="Predicted A"
                          stroke="#3a4894"
                          dot={false}
                          strokeWidth={2}
                          strokeDasharray="5 5"
                        />
                        <Line
                          type="monotone"
                          dataKey="spread"
                          name="Spread"
                          stroke="#ff6b6b"
                          dot={false}
                          strokeWidth={1.5}
                          yAxisId="right"
                        />
                        <YAxis yAxisId="right" orientation="right" tick={{ fill: "#dce5f3" }} />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {animationStep === 0 ? (
                    // Correlated Pair Stats
                    <>
                      <div className="bg-navy-800/50 p-2 rounded">
                        <p className="text-xs text-gray-400">Correlation</p>
                        <p className="text-lg font-medium text-gold-400">0.92</p>
                      </div>
                      <div className="bg-navy-800/50 p-2 rounded">
                        <p className="text-xs text-gray-400">Beta</p>
                        <p className="text-lg font-medium text-gold-400">0.85</p>
                      </div>
                      <div className="bg-navy-800/50 p-2 rounded">
                        <p className="text-xs text-gray-400">Cointegration</p>
                        <p className="text-lg font-medium text-green-400">Yes</p>
                      </div>
                    </>
                  ) : animationStep === 1 ? (
                    // Z-Score Stats
                    <>
                      <div className="bg-navy-800/50 p-2 rounded">
                        <p className="text-xs text-gray-400">Current Z-Score</p>
                        <p className="text-lg font-medium text-red-400">2.4</p>
                      </div>
                      <div className="bg-navy-800/50 p-2 rounded">
                        <p className="text-xs text-gray-400">Signal</p>
                        <p className="text-lg font-medium text-gold-400">Short A / Long B</p>
                      </div>
                      <div className="bg-navy-800/50 p-2 rounded">
                        <p className="text-xs text-gray-400">Half-Life</p>
                        <p className="text-lg font-medium text-gold-400">5.2 days</p>
                      </div>
                    </>
                  ) : (
                    // OLS Regression Stats
                    <>
                      <div className="bg-navy-800/50 p-2 rounded">
                        <p className="text-xs text-gray-400">Alpha</p>
                        <p className="text-lg font-medium text-gold-400">5.0</p>
                      </div>
                      <div className="bg-navy-800/50 p-2 rounded">
                        <p className="text-xs text-gray-400">Beta</p>
                        <p className="text-lg font-medium text-gold-400">1.2</p>
                      </div>
                      <div className="bg-navy-800/50 p-2 rounded">
                        <p className="text-xs text-gray-400">R-squared</p>
                        <p className="text-lg font-medium text-gold-400">0.89</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Why Pair Trading Section */}
      <section className="py-8">
        {/* Title and description outside the card */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-white mb-4">Why Pair Trading?</h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Statistical arbitrage through pair trading offers unique advantages over traditional trading strategies
          </p>
        </div>

        {/* Card containing all 6 advantages */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-16 p-8">
            {/* Advantage 1 - Market Neutrality */}
            <div className="flex flex-col items-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-navy-700/60 mb-5">
                <Shield className="h-8 w-8 text-gold-400" />
              </div>
              <h3 className="text-xl font-semibold text-gold-400 mb-3 text-center">Market Neutrality</h3>
              <p className="text-gray-300 text-center">
                Hedge against market risk by simultaneously taking long and short positions in correlated securities,
                providing protection against broad market movements and reducing exposure to systematic risk.
              </p>
            </div>

            {/* Advantage 2 - Statistical Edge */}
            <div className="flex flex-col items-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-navy-700/60 mb-5">
                <BarChart2 className="h-8 w-8 text-gold-400" />
              </div>
              <h3 className="text-xl font-semibold text-gold-400 mb-3 text-center">Statistical Edge</h3>
              <p className="text-gray-300 text-center">
                Leverage mean reversion principles and statistical analysis to identify high-probability trades with
                quantifiable risk-reward profiles based on historical price relationships.
              </p>
            </div>

            {/* Advantage 3 - Consistent Returns */}
            <div className="flex flex-col items-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-navy-700/60 mb-5">
                <Zap className="h-8 w-8 text-gold-400" />
              </div>
              <h3 className="text-xl font-semibold text-gold-400 mb-3 text-center">Consistent Returns</h3>
              <p className="text-gray-300 text-center">
                Generate alpha regardless of market direction through disciplined statistical arbitrage that can perform
                in bull, bear, and sideways markets, providing more reliable performance.
              </p>
            </div>

            {/* Advantage 4 - Reduced Volatility */}
            <div className="flex flex-col items-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-navy-700/60 mb-5">
                <svg
                  className="h-8 w-8 text-gold-400"
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 12h2l4 10 4-18 4 18 4-10h2"></path>
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gold-400 mb-3 text-center">Reduced Volatility</h3>
              <p className="text-gray-300 text-center">
                Experience lower portfolio volatility compared to directional strategies, leading to more stable returns
                and improved risk-adjusted performance metrics like Sharpe and Sortino ratios.
              </p>
            </div>

            {/* Advantage 5 - Diversification Benefits */}
            <div className="flex flex-col items-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-navy-700/60 mb-5">
                <svg
                  className="h-8 w-8 text-gold-400"
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M8 12h8"></path>
                  <path d="M12 8v8"></path>
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gold-400 mb-3 text-center">Diversification Benefits</h3>
              <p className="text-gray-300 text-center">
                Add a truly uncorrelated strategy to your portfolio that performs independently of traditional asset
                classes and market conditions, enhancing overall portfolio diversification.
              </p>
            </div>

            {/* Advantage 6 - Lower Capital Requirements */}
            <div className="flex flex-col items-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-navy-700/60 mb-5">
                <svg
                  className="h-8 w-8 text-gold-400"
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gold-400 mb-3 text-center">Lower Capital Requirements</h3>
              <p className="text-gray-300 text-center">
                Utilize margin more efficiently with offsetting positions, allowing you to deploy capital strategically
                and potentially increase returns while maintaining appropriate risk management.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-8">
        {/* Title and description outside the card */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-white mb-4">How Pair Trading Works</h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Our platform simplifies the pair trading process from analysis to execution
          </p>
        </div>

        <div className="card">
          <div className="flex border-b border-navy-700 mb-8">
            <button
              onClick={() => setActiveTab("what")}
              className={`px-6 py-3 font-medium ${
                activeTab === "what" ? "text-gold-400 border-b-2 border-gold-400" : "text-gray-300 hover:text-white"
              }`}
            >
              What is Pair Trading?
            </button>
            <button
              onClick={() => setActiveTab("process")}
              className={`px-6 py-3 font-medium ${
                activeTab === "process" ? "text-gold-400 border-b-2 border-gold-400" : "text-gray-300 hover:text-white"
              }`}
            >
              The Process
            </button>
            <button
              onClick={() => setActiveTab("platform")}
              className={`px-6 py-3 font-medium ${
                activeTab === "platform" ? "text-gold-400 border-b-2 border-gold-400" : "text-gray-300 hover:text-white"
              }`}
            >
              Our Platform
            </button>
          </div>

          <div className="min-h-[300px]">
            {activeTab === "what" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                  <h3 className="text-2xl font-bold text-white mb-4">Statistical Arbitrage Strategy</h3>
                  <p className="text-gray-300 mb-4 leading-relaxed">
                    Pair trading is a market-neutral strategy that matches a long position with a short position in a
                    pair of highly correlated instruments.
                  </p>
                  <p className="text-gray-300 mb-4 leading-relaxed">
                    The strategy capitalizes on the historical relationship between two securities, betting that
                    temporary deviations in their price correlation will revert to the mean.
                  </p>
                  <p className="text-gray-300 leading-relaxed">
                    When the spread between the pair widens beyond statistical norms (measured by z-score), traders
                    enter positions expecting the spread to converge back to its historical average.
                  </p>
                </div>
                <div className="bg-navy-800/50 p-6 rounded-xl border border-navy-700">
                  <h4 className="text-xl font-medium text-gold-400 mb-4">Key Concepts</h4>
                  <ul className="space-y-3">
                    <li className="flex items-start">
                      <div className="bg-navy-700 p-1 rounded mr-3 mt-1">
                        <TrendingDown className="h-4 w-4 text-gold-400" />
                      </div>
                      <div>
                        <span className="font-medium text-white">Correlation</span>
                        <p className="text-sm text-gray-300">Statistical relationship between two securities</p>
                      </div>
                    </li>
                    <li className="flex items-start">
                      <div className="bg-navy-700 p-1 rounded mr-3 mt-1">
                        <TrendingUp className="h-4 w-4 text-gold-400" />
                      </div>
                      <div>
                        <span className="font-medium text-white">Mean Reversion</span>
                        <p className="text-sm text-gray-300">Tendency for prices to return to their average</p>
                      </div>
                    </li>
                    <li className="flex items-start">
                      <div className="bg-navy-700 p-1 rounded mr-3 mt-1">
                        <BarChart2 className="h-4 w-4 text-gold-400" />
                      </div>
                      <div>
                        <span className="font-medium text-white">Z-Score</span>
                        <p className="text-sm text-gray-300">Measures deviation from historical mean</p>
                      </div>
                    </li>
                    <li className="flex items-start">
                      <div className="bg-navy-700 p-1 rounded mr-3 mt-1">
                        <Clock className="h-4 w-4 text-gold-400" />
                      </div>
                      <div>
                        <span className="font-medium text-white">Half-Life</span>
                        <p className="text-sm text-gray-300">Time for spread to revert halfway to its mean</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === "process" && (
              <div className="space-y-8">
                <div className="relative">
                  <div className="hidden md:block absolute top-0 left-0 w-full h-1 bg-navy-700">
                    <div className="absolute top-0 left-0 h-1 bg-gold-400 w-[80%]"></div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-8">
                    <div className="relative">
                      <div className="hidden md:block absolute top-[-24px] left-[calc(50%-12px)] w-6 h-6 rounded-full bg-gold-400 border-4 border-navy-900 z-10"></div>
                      <div className="card h-full">
                        <h4 className="text-lg font-medium text-gold-400 mb-2">1. Identify Pairs</h4>
                        <p className="text-sm text-gray-300">
                          Find correlated securities with strong statistical relationships and historical mean reversion
                          patterns
                        </p>
                      </div>
                    </div>

                    <div className="relative">
                      <div className="hidden md:block absolute top-[-24px] left-[calc(50%-12px)] w-6 h-6 rounded-full bg-gold-400 border-4 border-navy-900 z-10"></div>
                      <div className="card h-full">
                        <h4 className="text-lg font-medium text-gold-400 mb-2">2. Analyze Relationship</h4>
                        <p className="text-sm text-gray-300">
                          Calculate correlation, cointegration, and other statistical measures to validate pair
                          stability
                        </p>
                      </div>
                    </div>

                    <div className="relative">
                      <div className="hidden md:block absolute top-[-24px] left-[calc(50%-12px)] w-6 h-6 rounded-full bg-gold-400 border-4 border-navy-900 z-10"></div>
                      <div className="card h-full">
                        <h4 className="text-lg font-medium text-gold-400 mb-2">3. Backtest Strategy</h4>
                        <p className="text-sm text-gray-300">
                          Test trading rules using historical data to optimize entry/exit points and position sizing
                        </p>
                      </div>
                    </div>

                    <div className="relative">
                      <div className="hidden md:block absolute top-[-24px] left-[calc(50%-12px)] w-6 h-6 rounded-full bg-navy-700 border-4 border-navy-900 z-10"></div>
                      <div className="card h-full bg-navy-900/50">
                        <h4 className="text-lg font-medium text-gray-300 mb-2">4. Execute Trades</h4>
                        <p className="text-sm text-gray-400">
                          Enter positions when statistical signals indicate high-probability opportunities
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-navy-800/50 p-6 rounded-xl border border-navy-700">
                  <h4 className="text-xl font-medium text-gold-400 mb-4">Trading Signals</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-navy-900/50 p-4 rounded-md border border-navy-700">
                      <div className="flex items-center mb-2">
                        <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
                        <h5 className="font-medium text-white">Long/Short Signal (Z-Score {"<"} -2)</h5>
                      </div>
                      <p className="text-sm text-gray-300">
                        When the z-score falls below -2, go long on the underperforming stock and short the
                        outperforming stock
                      </p>
                    </div>

                    <div className="bg-navy-900/50 p-4 rounded-md border border-navy-700">
                      <div className="flex items-center mb-2">
                        <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                        <h5 className="font-medium text-white">Short/Long Signal (Z-Score {">"} 2)</h5>
                      </div>
                      <p className="text-sm text-gray-300">
                        When the z-score rises above 2, go short on the outperforming stock and long the underperforming
                        stock
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "platform" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                  <h3 className="text-2xl font-bold text-white mb-4">Comprehensive Pair Trading Tools</h3>
                  <p className="text-gray-300 mb-4 leading-relaxed">
                    Our platform provides everything you need to implement successful pair trading strategies from start
                    to finish.
                  </p>
                  <ul className="space-y-3">
                    <li className="flex items-start">
                      <div className="bg-navy-700 p-1 rounded-full mr-3 mt-1">
                        <svg className="h-4 w-4 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-gray-300">Advanced pair screening and correlation analysis</span>
                    </li>
                    <li className="flex items-start">
                      <div className="bg-navy-700 p-1 rounded-full mr-3 mt-1">
                        <svg className="h-4 w-4 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-gray-300">Multiple statistical models (ratio, OLS, Kalman filter)</span>
                    </li>
                    <li className="flex items-start">
                      <div className="bg-navy-700 p-1 rounded-full mr-3 mt-1">
                        <svg className="h-4 w-4 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-gray-300">Comprehensive backtesting with detailed performance metrics</span>
                    </li>
                    <li className="flex items-start">
                      <div className="bg-navy-700 p-1 rounded-full mr-3 mt-1">
                        <svg className="h-4 w-4 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-gray-300">Real-time monitoring and trading signals</span>
                    </li>
                    <li className="flex items-start">
                      <div className="bg-navy-700 p-1 rounded-full mr-3 mt-1">
                        <svg className="h-4 w-4 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-gray-300">Custom watchlists and alerts</span>
                    </li>
                  </ul>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <img
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/attachments/gen-images/public/stock-analysis-dashboard-Qeu6mBnIlbmBEEQgrb3a2uFlBD96Xd.png"
                    alt="Pair Analysis"
                    className="rounded-lg shadow-lg border border-navy-700"
                  />
                  <img
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/attachments/gen-images/public/financial-performance-overview-M7CKM9OmlUhkPn8xliDxaWd2IoUUCs.png"
                    alt="Backtest Results"
                    className="rounded-lg shadow-lg border border-navy-700"
                  />
                  <img
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/attachments/gen-images/public/dynamic-trading-overview-rf89nSrAu06tykGqJHZv90MvNq26hJ.png"
                    alt="Trading Signals"
                    className="rounded-lg shadow-lg border border-navy-700"
                  />
                  <img
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/attachments/gen-images/public/stock-correlation-heatmap-chgp0Jk4DL6SlUldyDydlDoNMk8xbW.png"
                    alt="Correlation Matrix"
                    className="rounded-lg shadow-lg border border-navy-700"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-8">
        <div className="bg-gold-400 rounded-xl shadow-lg" style={{ backgroundColor: "#ffd700" }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center p-8">
            <div>
              <h2 className="text-3xl font-bold text-navy-900 mb-4">Ready to Start Pair Trading?</h2>
              <p className="text-xl text-navy-800 mb-6">
                Join thousands of traders using our platform to find statistical edges in the market
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href="/contact" className="btn-secondary inline-flex items-center">
                  <Phone className="mr-2 h-5 w-5" /> Contact Us
                </Link>
                <Link href="/chat" className="btn-secondary inline-flex items-center">
                  <MessageCircle className="mr-2 h-5 w-5" /> Live Chat
                </Link>
              </div>
            </div>

            <div className="hidden md:block">
              <svg width="100%" height="300" viewBox="0 0 600 300" xmlns="http://www.w3.org/2000/svg">
                {/* Background with rounded corners */}
                <rect width="600" height="300" fill="#ffed8c" rx="15" ry="15"></rect>

                {/* Light blue channel for normal trading range */}
                <rect x="50" y="100" width="500" height="100" fill="#e6f7ff" fillOpacity="0.5" rx="10" ry="10"></rect>

                {/* Upper band - dark red */}
                <path
                  d="M 50 100 C 100 90, 150 110, 200 100 C 250 90, 300 110, 350 100 C 400 90, 450 110, 500 100 C 550 90"
                  fill="none"
                  stroke="#990000"
                  strokeWidth="2.5"
                />
                <text x="50" y="85" fontSize="12" fill="#990000" fontFamily="Arial">
                  Upper Band
                </text>

                {/* Lower band - dark green */}
                <path
                  d="M 50 200 C 100 210, 150 190, 200 200 C 250 210, 300 190, 350 200 C 400 210, 450 190, 500 200 C 550 210"
                  fill="none"
                  stroke="#006600"
                  strokeWidth="2.5"
                />
                <text x="50" y="225" fontSize="12" fill="#006600" fontFamily="Arial">
                  Lower Band
                </text>

                {/* Oscillating line (spread) - dark grey with more turns */}
                <path
                  d="M 50 150 
                     C 75 100, 100 100, 125 100 
                     C 150 100, 175 150, 200 150 
                     C 225 150, 250 200, 275 200 
                     C 300 200, 325 150, 350 150 
                     C 375 150, 400 100, 425 100 
                     C 450 100, 475 150, 500 150 
                     C 525 150, 550 200, 575 200"
                  fill="none"
                  stroke="#333333"
                  strokeWidth="3"
                />

                {/* Entry/exit points */}
                <circle cx="125" cy="100" r="6" fill="white" stroke="#333333" strokeWidth="2" />
                <circle cx="275" cy="200" r="6" fill="white" stroke="#333333" strokeWidth="2" />
                <circle cx="425" cy="100" r="6" fill="white" stroke="#333333" strokeWidth="2" />
                <circle cx="575" cy="200" r="6" fill="white" stroke="#333333" strokeWidth="2" />
              </svg>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
