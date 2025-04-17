import Link from "next/link"

export default function Home() {
  return (
    <div className="space-y-12 py-8">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold text-white">Pair Trading Platform</h1>
        <p className="text-xl text-gray-300 max-w-3xl mx-auto">
          A comprehensive platform for statistical arbitrage and pair trading strategies
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-8 mt-16">
        <Link href="/stocks" className="block group">
          <div className="card h-full transition-transform group-hover:translate-y-[-4px]">
            <div className="flex flex-col items-center text-center p-4">
              <div className="w-16 h-16 bg-navy-800 rounded-full flex items-center justify-center mb-6">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 text-gold-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gold-400 mb-3">Stock Data</h3>
              <p className="text-gray-300">Fetch and manage stock data from various sources</p>
            </div>
          </div>
        </Link>

        <Link href="/watchlists" className="block group">
          <div className="card h-full transition-transform group-hover:translate-y-[-4px]">
            <div className="flex flex-col items-center text-center p-4">
              <div className="w-16 h-16 bg-navy-800 rounded-full flex items-center justify-center mb-6">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 text-gold-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gold-400 mb-3">Watchlists</h3>
              <p className="text-gray-300">Create and manage your pair trading watchlists</p>
            </div>
          </div>
        </Link>

        <Link href="/pair-analyzer" className="block group">
          <div className="card h-full transition-transform group-hover:translate-y-[-4px]">
            <div className="flex flex-col items-center text-center p-4">
              <div className="w-16 h-16 bg-navy-800 rounded-full flex items-center justify-center mb-6">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 text-gold-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gold-400 mb-3">Pair Analyzer</h3>
              <p className="text-gray-300">Analyze statistical relationships between stock pairs</p>
            </div>
          </div>
        </Link>

        <Link href="/backtest" className="block group">
          <div className="card h-full transition-transform group-hover:translate-y-[-4px]">
            <div className="flex flex-col items-center text-center p-4">
              <div className="w-16 h-16 bg-navy-800 rounded-full flex items-center justify-center mb-6">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 text-gold-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gold-400 mb-3">Ratio Backtest</h3>
              <p className="text-gray-300">Backtest pair trading strategies using price ratios</p>
            </div>
          </div>
        </Link>

        <Link href="/backtest-spread" className="block group">
          <div className="card h-full transition-transform group-hover:translate-y-[-4px]">
            <div className="flex flex-col items-center text-center p-4">
              <div className="w-16 h-16 bg-navy-800 rounded-full flex items-center justify-center mb-6">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 text-gold-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gold-400 mb-3">Spread Backtest</h3>
              <p className="text-gray-300">Backtest pair trading strategies using price spreads</p>
            </div>
          </div>
        </Link>
      </div>

      <div className="card mt-16">
        <h2 className="text-2xl font-bold text-white mb-4">About Pair Trading</h2>
        <p className="text-gray-300 mb-4 leading-relaxed">
          Pair trading is a market-neutral trading strategy that matches a long position with a short position in a pair
          of highly correlated instruments. The strategy takes advantage of temporary deviations in the price
          correlation between two stocks, betting that the 'Spread' between two prices will revert to its mean.
        </p>
        <p className="text-gray-300 leading-relaxed">
          This platform provides tools to identify potential pairs, backtest strategies, and analyze performance metrics
          to help you make informed trading decisions.
        </p>
      </div>
    </div>
  )
}
