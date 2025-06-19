import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { timeSeries } = await request.json()

    if (!timeSeries || !Array.isArray(timeSeries)) {
      return NextResponse.json({ error: "Invalid input: 'timeSeries' must be an array." }, { status: 400 })
    }

    // Replace with the actual URL of your running Python backend
    const pythonBackendUrl = process.env.PYTHON_ADF_BACKEND_URL || "http://127.0.0.1:5000/api/adf-test"

    const response = await fetch(pythonBackendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ time_series: timeSeries }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Python backend error: ${response.status} - ${errorText}`)
      return NextResponse.json(
        { error: `Failed to get ADF results from backend: ${errorText}` },
        { status: response.status },
      )
    }

    const adfResults = await response.json()
    return NextResponse.json(adfResults, { status: 200 })
  } catch (error) {
    console.error("Error in Next.js ADF proxy API:", error)
    return NextResponse.json({ error: "Internal server error during ADF test proxy." }, { status: 500 })
  }
}
