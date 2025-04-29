export default function StockTable({ stocks }) {
  if (stocks.length === 0)
    return (
      <div className="text-center py-8">
        <p className="text-gray-300">No data available.</p>
      </div>
    )

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-navy-700">
        <thead className="bg-navy-800">
          <tr>
            <th className="table-header">Date</th>
            <th className="table-header">Symbol</th>
            <th className="table-header">Open</th>
            <th className="table-header">High</th>
            <th className="table-header">Low</th>
            <th className="table-header">Close</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-navy-800">
          {stocks.map((stock, index) => (
            <tr key={index} className={index % 2 === 0 ? "bg-navy-900/50" : "bg-navy-900/30"}>
              <td className="table-cell">{stock.date}</td>
              <td className="table-cell text-gold-400 font-medium">{stock.symbol}</td>
              <td className="table-cell">{stock.open.toFixed(2)}</td>
              <td className="table-cell">{stock.high.toFixed(2)}</td>
              <td className="table-cell">{stock.low.toFixed(2)}</td>
              <td className="table-cell">{stock.close.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
