// public/workers/adf-worker.js
self.onmessage = async (event) => {
  const { type, data, backendUrl } = event.data

  if (type === "runAdfTest") {
    const time_series = data

    if (time_series.length < 5) {
      self.postMessage({
        type: "adfTestResult",
        result: { statistic: 0, pValue: 1, criticalValues: { "1%": 0, "5%": 0, "10%": 0 }, isStationary: false },
      })
      return
    }

    try {
      const response = await fetch(`${backendUrl}/adf-test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ time_series: time_series }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      self.postMessage({ type: "adfTestResult", result })
    } catch (error) {
      console.error("Error fetching ADF test results in worker:", error)
      self.postMessage({
        type: "adfTestError",
        error: error.message || "Failed to fetch ADF test results.",
      })
    }
  }
}
