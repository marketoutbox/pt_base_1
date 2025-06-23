"use client"

import "../styles/globals.css"
import Layout from "../components/Layout"
import { useEffect } from "react"

// Declare a module-level variable to hold the worker instance.
// This makes it a singleton across the client-side application.
let calculationsWorker: Worker | null = null

/**
 * Returns the singleton instance of the calculations web worker.
 * Instantiates it if it doesn't already exist.
 */
export function getCalculationsWorker(): Worker {
  if (!calculationsWorker) {
    console.log("Instantiating calculations worker (first access)...")
    calculationsWorker = new Worker("/workers/calculations-worker.js", { type: "module" })
    // Attach global message/error handlers for debugging or general worker status
    calculationsWorker.onmessage = (event) => {
      if (event.data.type === "debug") {
        console.log("[Global Worker Debug]", event.data.message)
      } else if (event.data.type === "error") {
        // <--- ADDED THIS BLOCK
        console.error("[Global Worker Error Message]", event.data.message)
      }
      // Specific component messages (like analysisComplete) will be handled by their own listeners
    }
    calculationsWorker.onerror = (e) => {
      console.error("[Global Worker Error]", e)
    }
  }
  return calculationsWorker
}

function MyApp({ Component, pageProps }) {
  // This useEffect ensures the worker is instantiated as soon as the app loads,
  // even if getCalculationsWorker isn't called immediately by a specific page component.
  useEffect(() => {
    // Trigger worker instantiation on app mount
    getCalculationsWorker()

    // Cleanup worker on app unmount (e.g., browser tab close)
    return () => {
      if (calculationsWorker) {
        console.log("Terminating calculations worker on app unmount...")
        calculationsWorker.terminate()
        calculationsWorker = null
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
