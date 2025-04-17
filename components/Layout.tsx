"use client"

import Link from "next/link"
import { useRouter } from "next/router"
import { useEffect, useState } from "react"

export default function Layout({ children }) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  // Only show the component after it's mounted on the client
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    // Return a simple layout without router-dependent parts during SSR
    return (
      <div className="min-h-screen bg-navy-950">
        <nav className="border-b border-navy-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="text-2xl font-bold text-white">PairTrade</div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-navy-950">
      <nav className="border-b border-navy-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="text-2xl font-bold text-white">
              PairTrade
            </Link>

            <div className="hidden md:flex space-x-8">
              <NavLink href="/" current={router.pathname === "/"}>
                Home
              </NavLink>
              <NavLink href="/stocks" current={router.pathname === "/stocks"}>
                Stocks
              </NavLink>
              <NavLink href="/watchlists" current={router.pathname === "/watchlists"}>
                Watchlists
              </NavLink>
              <NavLink href="/pair-analyzer" current={router.pathname === "/pair-analyzer"}>
                Pair Analyzer
              </NavLink>
              <NavLink href="/backtest" current={router.pathname === "/backtest"}>
                Ratio Backtest
              </NavLink>
              <NavLink href="/backtest-spread" current={router.pathname === "/backtest-spread"}>
                Spread Backtest
              </NavLink>
              <NavLink href="/pricing" current={router.pathname === "/pricing"}>
                Pricing
              </NavLink>
            </div>
            <div className="md:hidden flex items-center overflow-x-auto scrollbar-hide space-x-1 py-2">
              <NavLink href="/" current={router.pathname === "/"}>
                Home
              </NavLink>
              <NavLink href="/stocks" current={router.pathname === "/stocks"}>
                Stocks
              </NavLink>
              <NavLink href="/watchlists" current={router.pathname === "/watchlists"}>
                Lists
              </NavLink>
              <NavLink href="/pair-analyzer" current={router.pathname === "/pair-analyzer"}>
                Analyzer
              </NavLink>
              <NavLink href="/backtest" current={router.pathname === "/backtest"}>
                Ratio
              </NavLink>
              <NavLink href="/backtest-spread" current={router.pathname === "/backtest-spread"}>
                Spread
              </NavLink>
              <NavLink href="/pricing" current={router.pathname === "/pricing"}>
                Pricing
              </NavLink>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  )
}

function NavLink({ href, current, children }) {
  return (
    <Link
      href={href}
      className={`text-base font-medium transition-colors ${current ? "text-white" : "text-gray-300 hover:text-white"}`}
    >
      {children}
    </Link>
  )
}
