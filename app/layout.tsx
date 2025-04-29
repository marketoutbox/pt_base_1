"use client"

import "../styles/globals.css"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Menu, X } from "lucide-react"

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </head>
      <body className="min-h-screen bg-gradient-to-b from-[#0f1428] via-navy-950 to-navy-900 bg-fixed">
        <nav className="bg-navy-900/80 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex-shrink-0 flex items-center">
                <img src="/assets/pt_logo.png" alt="PairTrade Logo" className="h-12" />
              </Link>
              <div className="hidden md:flex items-baseline space-x-6">
                <ClientNav />
              </div>
              <div className="md:hidden">
                <MobileNav />
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
      </body>
    </html>
  )
}

// Client component for navigation with active state
function ClientNav() {
  const pathname = usePathname()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  return (
    <>
      <NavLink href="/" isActive={pathname === "/"}>
        Home
      </NavLink>
      <NavLink href="/stocks" isActive={pathname === "/stocks"}>
        Stocks
      </NavLink>
      <NavLink href="/watchlists" isActive={pathname === "/watchlists"}>
        Watchlists
      </NavLink>
      <NavLink href="/pair-analyzer" isActive={pathname === "/pair-analyzer"}>
        Pair Analyzer
      </NavLink>

      {/* Dropdown for backtests */}
      <div className="relative" onMouseEnter={() => setDropdownOpen(true)} onMouseLeave={() => setDropdownOpen(false)}>
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium flex items-center justify-center border
  ${
    pathname === "/backtest" || pathname === "/backtest-spread"
      ? "bg-gold-400 hover:bg-gold-500 text-navy-950 border-transparent"
      : "text-navy-100 border-transparent hover:border-gold-400"
  }`}
        >
          Backtests
        </button>

        {dropdownOpen && (
          <div className="absolute left-0 mt-1 w-48 rounded-md shadow-lg bg-navy-800 ring-1 ring-black ring-opacity-5 z-10">
            <div className="py-1" role="menu" aria-orientation="vertical">
              <Link
                href="/backtest"
                className={`block px-4 py-2 text-sm ${
                  pathname === "/backtest" ? "bg-gold-400 text-navy-950" : "text-navy-100 hover:bg-navy-700"
                }`}
                role="menuitem"
                onClick={(e) => e.stopPropagation()}
              >
                Ratio Backtest
              </Link>
              <Link
                href="/backtest-spread"
                className={`block px-4 py-2 text-sm ${
                  pathname === "/backtest-spread" ? "bg-gold-400 text-navy-950" : "text-navy-100 hover:bg-navy-700"
                }`}
                role="menuitem"
                onClick={(e) => e.stopPropagation()}
              >
                Spread Backtest
              </Link>
            </div>
          </div>
        )}
      </div>

      <NavLink href="/pricing" isActive={pathname === "/pricing"}>
        Pricing
      </NavLink>
    </>
  )
}

// Mobile navigation component
function MobileNav() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [backtestsOpen, setBacktestsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center p-2 rounded-md text-gray-300 hover:text-white hover:bg-navy-800 focus:outline-none"
      >
        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {isOpen && (
        <div className="absolute top-16 right-0 left-0 bg-navy-900 shadow-lg z-20 border-t border-navy-800">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <MobileNavLink href="/" isActive={pathname === "/"}>
              Home
            </MobileNavLink>
            <MobileNavLink href="/stocks" isActive={pathname === "/stocks"}>
              Stocks
            </MobileNavLink>
            <MobileNavLink href="/watchlists" isActive={pathname === "/watchlists"}>
              Watchlists
            </MobileNavLink>
            <MobileNavLink href="/pair-analyzer" isActive={pathname === "/pair-analyzer"}>
              Pair Analyzer
            </MobileNavLink>

            {/* Mobile Backtests Dropdown */}
            <div>
              <button
                onClick={() => setBacktestsOpen(!backtestsOpen)}
                className={`w-full text-left px-3 py-2 rounded-md text-base font-medium border ${
                  pathname === "/backtest" || pathname === "/backtest-spread"
                    ? "bg-gold-400 text-navy-950 border-transparent"
                    : "text-navy-100 border-transparent hover:border-gold-400"
                }`}
              >
                Backtests
              </button>
              {backtestsOpen && (
                <div className="pl-4 mt-1 space-y-1">
                  <MobileNavLink href="/backtest" isActive={pathname === "/backtest"} isSubmenu>
                    Ratio Backtest
                  </MobileNavLink>
                  <MobileNavLink href="/backtest-spread" isActive={pathname === "/backtest-spread"} isSubmenu>
                    Spread Backtest
                  </MobileNavLink>
                </div>
              )}
            </div>

            <MobileNavLink href="/pricing" isActive={pathname === "/pricing"}>
              Pricing
            </MobileNavLink>
          </div>
        </div>
      )}
    </>
  )
}

function NavLink({ href, isActive, children }) {
  return (
    <Link
      href={href}
      className={`px-4 py-2 rounded-md text-sm font-medium flex items-center justify-center border ${
        isActive
          ? "bg-gold-400 hover:bg-gold-500 text-navy-950 border-transparent"
          : "text-navy-100 border-transparent hover:border-gold-400"
      }`}
    >
      {children}
    </Link>
  )
}

function MobileNavLink({ href, isActive, isSubmenu = false, children }) {
  return (
    <Link
      href={href}
      className={`block px-3 py-2 rounded-md text-base font-medium ${isSubmenu ? "ml-4" : ""} ${
        isActive ? "bg-gold-400 text-navy-950" : "text-navy-100 hover:bg-navy-800"
      }`}
    >
      {children}
    </Link>
  )
}
