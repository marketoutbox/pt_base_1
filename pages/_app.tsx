import type { AppProps } from "next/app"
import "../styles/globals.css"
import Layout from "../components/Layout"
import { ThemeProvider } from "@/components/theme-provider"

// Create a single SharedWorker instance for general calculations (OLS, Kalman, Euclidean, ADF, Hurst, etc.)
let calculationsWorker: SharedWorker | null = null
if (typeof window !== "undefined" && "SharedWorker" in window) {
  calculationsWorker = new SharedWorker(new URL("../public/workers/calculations-worker.js", import.meta.url), {
    name: "calculations-worker",
    type: "module",
  })
  calculationsWorker.port.start() // Start the port connection
}

// Create a single SharedWorker instance for Ratio Model calculations
let ratioCalculationsWorker: SharedWorker | null = null
if (typeof window !== "undefined" && "SharedWorker" in window) {
  ratioCalculationsWorker = new SharedWorker(
    new URL("../public/workers/ratio-calculations-worker.js", import.meta.url),
    {
      name: "ratio-calculations-worker",
      type: "module",
    },
  )
  ratioCalculationsWorker.port.start() // Start the port connection
}

// Getter function for the main calculations worker
export function getCalculationsWorker(): SharedWorker {
  if (!calculationsWorker) {
    throw new Error("Calculations SharedWorker is not initialized.")
  }
  return calculationsWorker
}

// Getter function for the ratio calculations worker
export function getRatioCalculationsWorker(): SharedWorker {
  if (!ratioCalculationsWorker) {
    throw new Error("Ratio Calculations SharedWorker is not initialized.")
  }
  return ratioCalculationsWorker
}

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </ThemeProvider>
  )
}

export default MyApp
