"use client"

import type { AppProps } from "next/app"
import { ThemeProvider } from "@/components/theme-provider"
import "../app/globals.css"
import { Toaster } from "@/components/ui/toaster"
import { useEffect, useRef } from "react"

// Global worker instances
let calculationsWorker: Worker | null = null
let ratioCalculationsWorker: Worker | null = null

// Getter functions for workers
export function getCalculationsWorker(): Worker {
  if (!calculationsWorker) {
    calculationsWorker = new Worker("/workers/calculations-worker.js")
    console.log("Main calculations worker initialized.")
  }
  return calculationsWorker
}

export function getRatioCalculationsWorker(): Worker {
  if (!ratioCalculationsWorker) {
    ratioCalculationsWorker = new Worker("/workers/ratio-calculations-worker.js")
    console.log("Ratio calculations worker initialized.")
  }
  return ratioCalculationsWorker
}

export default function App({ Component, pageProps }: AppProps) {
  const isInitialized = useRef(false)

  useEffect(() => {
    if (!isInitialized.current) {
      // Initialize workers when the app mounts
      getCalculationsWorker()
      getRatioCalculationsWorker()
      isInitialized.current = true
    }

    // Clean up workers when the app unmounts
    return () => {
      if (calculationsWorker) {
        calculationsWorker.terminate()
        calculationsWorker = null
        console.log("Main calculations worker terminated.")
      }
      if (ratioCalculationsWorker) {
        ratioCalculationsWorker.terminate()
        ratioCalculationsWorker = null
        console.log("Ratio calculations worker terminated.")
      }
    }
  }, [])

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <Component {...pageProps} />
      <Toaster />
    </ThemeProvider>
  )
}
