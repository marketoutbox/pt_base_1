export default async function handler(req, res) {
  const { symbol } = req.query

  if (!symbol) {
    return res.status(400).json({ error: "Stock symbol is required" })
  }

  console.log(`API Request received for symbol: ${symbol}`)

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5y&interval=1d`
    console.log(`Fetching from Yahoo Finance: ${url}`)

    const response = await fetch(url)
    const data = await response.json()

    console.log("Yahoo API Response:", JSON.stringify(data, null, 2))

    if (data.chart?.error) {
      throw new Error(data.chart.error.description)
    }

    res.status(200).json(data.chart.result[0])
  } catch (error) {
    console.error(`Error fetching stock data for ${symbol}:`, error.message)
    res.status(500).json({ error: error.message })
  }
}
