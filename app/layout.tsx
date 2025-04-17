import "../styles/globals.css"
import Link from "next/link"

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </head>
      <body className="min-h-screen bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 bg-fixed">
        <nav className="bg-navy-900/80 border-b border-navy-700/10 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex-shrink-0">
                <span className="text-xl font-bold text-white">PairTrade</span>
              </Link>
              <div className="flex items-baseline space-x-4">
                <NavLink href="/">Home</NavLink>
                <NavLink href="/stocks">Stocks</NavLink>
                <NavLink href="/watchlists">Watchlists</NavLink>
                <NavLink href="/pair-analyzer">Pair Analyzer</NavLink>
                <NavLink href="/backtest">Ratio Backtest</NavLink>
                <NavLink href="/backtest-spread">Spread Backtest</NavLink>
                <NavLink href="/pricing">Pricing</NavLink>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
      </body>
    </html>
  )
}

function NavLink({ href, children }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-md text-sm font-medium text-navy-100 hover:bg-navy-800/30 hover:text-white"
    >
      {children}
    </Link>
  )
}
