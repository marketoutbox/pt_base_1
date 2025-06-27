"use client"

import "../styles/globals.css"
import Layout from "../components/Layout"
import { useEffect } from "react"

// Declare module-level variables to hold the worker instances.
// This makes them singletons across the client-side application.
let calculationsWorker: Worker | null = null
let ratioCalculationsWorker: Worker | null = null

/**
 * Returns the singleton instance of the main calculations web worker.
 * Instantiates it if it doesn't already exist.
 */
export function getCalculationsWorker(): Worker {
  if (!calculationsWorker) {
    console.log("Instantiating main calculations worker (first access)...")
    calculationsWorker = new Worker("/workers/calculations-worker.js", { type: "module" })
    // Attach global message/error handlers for debugging or general worker status
    calculationsWorker.onmessage = (event) => {
      if (event.data.type === "debug") {
        console.log("[Global Main Worker Debug]", event.data.message)
      } else if (event.data.type === "error") {
        console.error("[Global Main Worker Error Message]", event.data.message)
      }
      // Specific component messages (like analysisComplete) will be handled by their own listeners
    }
    calculationsWorker.onerror = (e) => {
      console.error("[Global Main Worker Error]", e)
    }
  }
  return calculationsWorker
}

/**
 * Returns the singleton instance of the ratio calculations web worker.
 * Instantiates it if it doesn't already exist.
 */
export function getRatioCalculationsWorker(): Worker {
  if (!ratioCalculationsWorker) {
    console.log("Instantiating ratio calculations worker (first access)...")
    ratioCalculationsWorker = new Worker("/workers/ratio-calculations-worker.js", { type: "module" })
    // Attach global message/error handlers for debugging or general worker status
    ratioCalculationsWorker.onmessage = (event) => {
      if (event.data.type === "debug") {
        console.log("[Global Ratio Worker Debug]", event.data.message)
      } else if (event.data.type === "error") {
        console.error("[Global Ratio Worker Error Message]", event.data.message)
      }
      // Specific component messages (like ratioAnalysisComplete) will be handled by their own listeners
    }
    ratioCalculationsWorker.onerror = (e) => {
      console.error("[Global Ratio Worker Error]", e)
    }
  }
  return ratioCalculationsWorker
}

function MyApp({ Component, pageProps }) {
  // This useEffect ensures the workers are instantiated as soon as the app loads,
  // even if the getter functions aren't called immediately by a specific page component.
  useEffect(() => {
    // Trigger worker instantiation on app mount
    getCalculationsWorker()
    getRatioCalculationsWorker()

    // Cleanup workers on app unmount (e.g., browser tab close)
    return () => {
      if (calculationsWorker) {
        console.log("Terminating main calculations worker on app unmount...")
        calculationsWorker.terminate()
        calculationsWorker = null
      }
      if (ratioCalculationsWorker) {
        console.log("Terminating ratio calculations worker on app unmount...")
        ratioCalculationsWorker.terminate()
        ratioCalculationsWorker = null
      }
    }
  }, []) // Empty dependency array ensures this runs once on app mount

  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  )
}

export default MyApp
