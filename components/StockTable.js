export default function StockTable({ stocks }) {
  if (stocks.length === 0) return <p>No data available.</p>

  return (
    <table border="1" cellPadding="10" style={{ marginTop: "20px", width: "100%" }}>
      <thead>
        <tr>
          <th>Date</th>
          <th>Symbol</th>
          <th>Open</th>
          <th>High</th>
          <th>Low</th>
          <th>Close</th>
        </tr>
      </thead>
      <tbody>
        {stocks.map((stock, index) => (
          <tr key={index}>
            <td>{stock.date}</td>
            <td>{stock.symbol}</td>
            <td>{stock.open.toFixed(2)}</td>
            <td>{stock.high.toFixed(2)}</td>
            <td>{stock.low.toFixed(2)}</td>
            <td>{stock.close.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
