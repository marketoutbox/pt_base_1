export default function Card({ title, children, className = "" }) {
  return (
    <div
      className={`bg-gradient-to-br from-navy-900/90 to-navy-800/90 backdrop-blur-sm rounded-lg shadow-lg border border-navy-700/20 ${className}`}
    >
      {title && (
        <div className="px-6 py-4 border-b border-navy-700/20">
          <h3 className="text-lg font-medium text-navy-100">{title}</h3>
        </div>
      )}
      <div className="px-6 py-4">{children}</div>
    </div>
  )
}
