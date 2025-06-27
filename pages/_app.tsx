import type { AppProps } from "next/app"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import Layout from "../components/Layout"
import "../styles/globals.css"

// Global worker instances
let calculationsWorker: Worker | null = null
let ratioCalculationsWorker: Worker | null = null

// Function to get or create the main calculations worker
export function getCalculationsWorker(): Worker {
  if (!calculationsWorker) {
    calculationsWorker = new Worker("/workers/calculations-worker.js")
    console.log("Created new calculations worker")
  }
  return calculationsWorker
}

// Function to get or create the ratio calculations worker
export function getRatioCalculationsWorker(): Worker {
  if (!ratioCalculationsWorker) {
    ratioCalculationsWorker = new Worker("/workers/ratio-calculations-worker.js")
    console.log("Created new ratio calculations worker")
  }
  return ratioCalculationsWorker
}

// Cleanup function to terminate workers
export function terminateWorkers() {
  if (calculationsWorker) {
    calculationsWorker.terminate()
    calculationsWorker = null
    console.log("Terminated calculations worker")
  }
  if (ratioCalculationsWorker) {
    ratioCalculationsWorker.terminate()
    ratioCalculationsWorker = null
    console.log("Terminated ratio calculations worker")
  }
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <Layout>
        <Component {...pageProps} />
      </Layout>
      <Toaster />
    </ThemeProvider>
  )
}
