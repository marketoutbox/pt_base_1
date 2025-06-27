"use client"

import "../styles/globals.css"
import Layout from "../components/Layout"
import { useEffect } from "react"

// Declare module-level variables to hold worker instances.
// This makes them singletons across the client-side application.
let ratioWorker: Worker | null = null
let olsWorker: Worker | null = null
let kalmanWorker: Worker | null = null
let euclideanWorker: Worker | null = null

/**
 * Returns the singleton instance of the specified calculations web worker.
 * Instantiates it if it doesn't already exist.
 */
export function getWorker(modelType: string): Worker {
  let workerInstance: Worker | null = null
  let workerPath = ""

  switch (modelType) {
    case "ratio":
      if (!ratioWorker) {
        workerPath = "/workers/ratio-worker.js"
        ratioWorker = new Worker(workerPath, { type: "module" })
        workerInstance = ratioWorker
      } else {
        workerInstance = ratioWorker
      }
      break
    case "ols":
      if (!olsWorker) {
        workerPath = "/workers/ols-worker.js"
        olsWorker = new Worker(workerPath, { type: "module" })
        workerInstance = olsWorker
      } else {
        workerInstance = olsWorker
      }
      break
    case "kalman":
      if (!kalmanWorker) {
        workerPath = "/workers/kalman-worker.js"
        kalmanWorker = new Worker(workerPath, { type: "module" })
        workerInstance = kalmanWorker
      } else {
        workerInstance = kalmanWorker
      }
      break
    case "euclidean":
      if (!euclideanWorker) {
        workerPath = "/workers/euclidean-worker.js"
        euclideanWorker = new Worker(workerPath, { type: "module" })
        workerInstance = euclideanWorker
      } else {
        workerInstance = euclideanWorker
      }
      break
    default:
      throw new Error(`Unknown model type: ${modelType}`)
  }

  if (workerInstance && !workerInstance._hasGlobalListeners) {
    console.log(`Instantiating ${modelType} worker (first access)...`)
    workerInstance.onmessage = (event) => {
      if (event.data.type === "debug") {
        console.log(`[Global ${modelType} Worker Debug]`, event.data.message)
      } else if (event.data.type === "error") {
        console.error(`[Global ${modelType} Worker Error Message]`, event.data.message)
      }
    }
    workerInstance.onerror = (e) => {
      console.error(`[Global ${modelType} Worker Error]`, e)
    }
    workerInstance._hasGlobalListeners = true // Mark to prevent re-adding
  }

  return workerInstance
}

function MyApp({ Component, pageProps }) {
  // This useEffect ensures the worker is instantiated as soon as the app loads,
  // even if getCalculationsWorker isn't called immediately by a specific page component.
  useEffect(() => {
    // Trigger worker instantiation for all models on app mount
    getWorker("ratio")
    getWorker("ols")
    getWorker("kalman")
    getWorker("euclidean")

    // Cleanup workers on app unmount (e.g., browser tab close)
    return () => {
      if (ratioWorker) {
        console.log("Terminating ratio worker on app unmount...")
        ratioWorker.terminate()
        ratioWorker = null
      }
      if (olsWorker) {
        console.log("Terminating OLS worker on app unmount...")
        olsWorker.terminate()
        olsWorker = null
      }
      if (kalmanWorker) {
        console.log("Terminating Kalman worker on app unmount...")
        kalmanWorker.terminate()
        kalmanWorker = null
      }
      if (euclideanWorker) {
        console.log("Terminating Euclidean worker on app unmount...")
        euclideanWorker.terminate()
        euclideanWorker = null
      }
    }
  }, [])

  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  )
}

export default MyApp
