import Link from "next/link"
import { Mail, Phone, MapPin, Github, Twitter, Linkedin } from "lucide-react"

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-navy-900/90 border-t border-navy-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo and About */}
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center mb-4">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gold-400 to-gold-500 flex items-center justify-center mr-3">
                <span className="text-navy-950 font-bold text-lg">PT</span>
              </div>
              <h3 className="text-xl font-bold text-white">PairTrade</h3>
            </div>
            <p className="text-gray-300 text-sm mb-4">
              Advanced statistical analysis for pair trading strategies. Market-neutral trading solutions for modern
              investors.
            </p>
            <p className="text-gray-400 text-sm">&copy; {currentYear} PairTrade. All rights reserved.</p>
          </div>

          {/* Quick Links */}
          <div className="col-span-1">
            <h4 className="text-gold-400 font-medium mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-gray-300 hover:text-gold-400 transition-colors text-sm">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/stocks" className="text-gray-300 hover:text-gold-400 transition-colors text-sm">
                  Stocks
                </Link>
              </li>
              <li>
                <Link href="/watchlists" className="text-gray-300 hover:text-gold-400 transition-colors text-sm">
                  Watchlists
                </Link>
              </li>
              <li>
                <Link href="/pair-analyzer" className="text-gray-300 hover:text-gold-400 transition-colors text-sm">
                  Pair Analyzer
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-gray-300 hover:text-gold-400 transition-colors text-sm">
                  Pricing
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div className="col-span-1">
            <h4 className="text-gold-400 font-medium mb-4">Resources</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/backtest" className="text-gray-300 hover:text-gold-400 transition-colors text-sm">
                  Ratio Backtest
                </Link>
              </li>
              <li>
                <Link href="/backtest-spread" className="text-gray-300 hover:text-gold-400 transition-colors text-sm">
                  Spread Backtest
                </Link>
              </li>
              <li>
                <Link href="#" className="text-gray-300 hover:text-gold-400 transition-colors text-sm">
                  Documentation
                </Link>
              </li>
              <li>
                <Link href="#" className="text-gray-300 hover:text-gold-400 transition-colors text-sm">
                  API Reference
                </Link>
              </li>
              <li>
                <Link href="#" className="text-gray-300 hover:text-gold-400 transition-colors text-sm">
                  Blog
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div className="col-span-1">
            <h4 className="text-gold-400 font-medium mb-4">Contact Us</h4>
            <ul className="space-y-3">
              <li className="flex items-start">
                <Mail className="h-5 w-5 text-gold-400 mr-2 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300 text-sm">support@pairtrade.com</span>
              </li>
              <li className="flex items-start">
                <Phone className="h-5 w-5 text-gold-400 mr-2 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300 text-sm">+1 (555) 123-4567</span>
              </li>
              <li className="flex items-start">
                <MapPin className="h-5 w-5 text-gold-400 mr-2 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300 text-sm">
                  123 Trading Street
                  <br />
                  Financial District
                  <br />
                  New York, NY 10004
                </span>
              </li>
            </ul>

            <div className="mt-6 flex space-x-4">
              <a href="#" className="text-gray-400 hover:text-gold-400 transition-colors">
                <Github className="h-5 w-5" />
                <span className="sr-only">GitHub</span>
              </a>
              <a href="#" className="text-gray-400 hover:text-gold-400 transition-colors">
                <Twitter className="h-5 w-5" />
                <span className="sr-only">Twitter</span>
              </a>
              <a href="#" className="text-gray-400 hover:text-gold-400 transition-colors">
                <Linkedin className="h-5 w-5" />
                <span className="sr-only">LinkedIn</span>
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-navy-800">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400 text-sm">
              Trading involves risk. Past performance is not indicative of future results.
            </p>
            <div className="mt-4 md:mt-0 flex space-x-6">
              <Link href="#" className="text-gray-400 hover:text-gold-400 transition-colors text-sm">
                Privacy Policy
              </Link>
              <Link href="#" className="text-gray-400 hover:text-gold-400 transition-colors text-sm">
                Terms of Service
              </Link>
              <Link href="#" className="text-gray-400 hover:text-gold-400 transition-colors text-sm">
                Cookie Policy
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
