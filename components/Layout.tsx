"use client"

import Link from "next/link"
import { useRouter } from "next/router"
import { useEffect, useState } from "react"
import { Menu, X } from "lucide-react" // Corrected import
import Footer from "./Footer"

export default function Layout({ children }) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileBacktestsOpen, setMobileBacktestsOpen] = useState(false)

  // Only show the component after it's mounted on the client
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    // Return a simple layout without router-dependent parts during SSR
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0f1428] via-navy-950 to-navy-900 bg-fixed">
        <nav>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex-shrink-0 flex items-center">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gold-400 to-gold-500 flex items-center justify-center">
                  <span className="text-navy-950 font-bold text-lg">PT</span>
                </div>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f1428] via-navy-950 to-navy-900 bg-fixed">
      <nav>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-shrink-0 flex items-center">
              <img src="/assets/pt_logo.png" alt="PairTrade Logo" className="h-10" />
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex nav-links space-x-6">
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
              <NavLink href="/scanner" current={router.pathname === "/scanner"}>
                Scanner
              </NavLink>

              {/* Dropdown for backtests */}
              <div
                className="relative"
                onMouseEnter={() => setDropdownOpen(true)}
                onMouseLeave={() => {
                  // Add a small delay before closing to prevent accidental closing
                  setTimeout(() => {
                    setDropdownOpen(false)
                  }, 300)
                }}
              >
                <button
                  className={`px-4 py-2 rounded-md text-sm font-medium flex items-center justify-center border ${
                    router.pathname === "/backtest" ||
                    router.pathname === "/backtest-spread" ||
                    router.pathname === "/backtest-kalman" ||
                    router.pathname === "/backtest-euclidean" // Added Euclidean link
                      ? "bg-gold-400 hover:bg-gold-500 text-navy-950 border-transparent"
                      : "text-navy-100 border-transparent hover:border-gold-400"
                  }`}
                >
                  Backtests
                </button>

                {dropdownOpen && (
                  <div
                    className="absolute left-0 mt-0 w-48 rounded-md shadow-lg bg-navy-800 ring-1 ring-black ring-opacity-5 z-10"
                    onMouseEnter={() => setDropdownOpen(true)}
                    onMouseLeave={() => setDropdownOpen(false)}
                  >
                    <div className="py-1" role="menu" aria-orientation="vertical">
                      <Link
                        href="/backtest"
                        className={`block px-4 py-2 text-sm ${
                          router.pathname === "/backtest"
                            ? "bg-gold-400 text-navy-950"
                            : "text-navy-100 hover:bg-navy-700"
                        }`}
                        role="menuitem"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Ratio Backtest
                      </Link>
                      <Link
                        href="/backtest-spread"
                        className={`block px-4 py-2 text-sm ${
                          router.pathname === "/backtest-spread"
                            ? "bg-gold-400 text-navy-950"
                            : "text-navy-100 hover:bg-navy-700"
                        }`}
                        role="menuitem"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Spread Backtest
                      </Link>
                      <Link
                        href="/backtest-kalman"
                        className={`block px-4 py-2 text-sm ${
                          router.pathname === "/backtest-kalman"
                            ? "bg-gold-400 text-navy-950"
                            : "text-navy-100 hover:bg-navy-700"
                        }`}
                        role="menuitem"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Kalman Backtest
                      </Link>
                      <Link
                        href="/backtest-euclidean" // Added Euclidean link
                        className={`block px-4 py-2 text-sm ${
                          router.pathname === "/backtest-euclidean"
                            ? "bg-gold-400 text-navy-950"
                            : "text-navy-100 hover:bg-navy-700"
                        }`}
                        role="menuitem"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Euclidean Backtest
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              <NavLink href="/pricing" current={router.pathname === "/pricing"}>
                Pricing
              </NavLink>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-300 hover:text-white hover:bg-navy-800 focus:outline-none"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-navy-800">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              <MobileNavLink href="/" current={router.pathname === "/"}>
                Home
              </MobileNavLink>
              <MobileNavLink href="/stocks" current={router.pathname === "/stocks"}>
                Stocks
              </MobileNavLink>
              <MobileNavLink href="/watchlists" current={router.pathname === "/watchlists"}>
                Watchlists
              </MobileNavLink>
              <MobileNavLink href="/pair-analyzer" current={router.pathname === "/pair-analyzer"}>
                Pair Analyzer
              </MobileNavLink>
              <MobileNavLink href="/scanner" current={router.pathname === "/scanner"}>
                Scanner
              </MobileNavLink>

              {/* Mobile Backtests Dropdown */}
              <div>
                <button
                  onClick={() => setMobileBacktestsOpen(!mobileBacktestsOpen)}
                  className={`w-full text-left px-3 py-2 rounded-md text-base font-medium border ${
                    router.pathname === "/backtest" ||
                    router.pathname === "/backtest-spread" ||
                    router.pathname === "/backtest-kalman" ||
                    router.pathname === "/backtest-euclidean" // Added Euclidean link
                      ? "bg-gold-400 text-navy-950 border-transparent"
                      : "text-navy-100 border-transparent hover:border-gold-400"
                  }`}
                >
                  Backtests
                </button>
                {mobileBacktestsOpen && (
                  <div className="pl-4 mt-1 space-y-1">
                    <MobileNavLink href="/backtest" current={router.pathname === "/backtest"} isSubmenu>
                      Ratio Backtest
                    </MobileNavLink>
                    <MobileNavLink href="/backtest-spread" current={router.pathname === "/backtest-spread"} isSubmenu>
                      Spread Backtest
                    </MobileNavLink>
                    <MobileNavLink href="/backtest-kalman" current={router.pathname === "/backtest-kalman"} isSubmenu>
                      Kalman Backtest
                    </MobileNavLink>
                    <MobileNavLink
                      href="/backtest-euclidean"
                      current={router.pathname === "/backtest-euclidean"}
                      isSubmenu
                    >
                      Euclidean Backtest
                    </MobileNavLink>
                  </div>
                )}
              </div>

              <MobileNavLink href="/pricing" current={router.pathname === "/pricing"}>
                Pricing
              </MobileNavLink>
            </div>
          </div>
        )}
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
      <Footer />
    </div>
  )
}

function NavLink({ href, current, children }) {
  return (
    <Link
      href={href}
      className={`px-4 py-2 rounded-md text-sm font-medium flex items-center justify-center border ${
        current
          ? "bg-gold-400 hover:bg-gold-500 text-navy-950 border-transparent"
          : "text-navy-100 border-transparent hover:border-gold-400"
      }`}
    >
      {children}
    </Link>
  )
}

function MobileNavLink({ href, current, isSubmenu = false, children }) {
  return (
    <Link
      href={href}
      className={`block px-3 py-2 rounded-md text-base font-medium ${isSubmenu ? "ml-4" : ""} ${
        current ? "bg-gold-400 text-navy-950" : "text-navy-100 hover:bg-navy-800"
      }`}
    >
      {children}
    </Link>
  )
}
