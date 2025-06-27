import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import Layout from "@/components/Layout"
import "@/app/globals.css"

// Global worker instances
let calculationsWorker: Worker | null = null
let ratioCalculationsWorker: Worker | null = null

// Getter functions for workers
export function getCalculationsWorker(): Worker {
  if (!calculationsWorker) {
    calculationsWorker = new Worker(new URL("../public/workers/calculations-worker.js", import.meta.url))
    console.log("Main calculations worker initialized.")
  }
  return calculationsWorker
}

export function getRatioCalculationsWorker(): Worker {
  if (!ratioCalculationsWorker) {
    ratioCalculationsWorker = new Worker(new URL("../public/workers/ratio-calculations-worker.js", import.meta.url))
    console.log("Ratio calculations worker initialized.")
  }
  return ratioCalculationsWorker
}

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <Layout>
        <Component {...pageProps} />
      </Layout>
      <Toaster />
    </ThemeProvider>
  )
}
