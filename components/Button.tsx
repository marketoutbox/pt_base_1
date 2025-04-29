"use client"

export default function Button({ children, onClick, disabled = false, primary = false, className = "" }) {
  const baseClasses =
    "px-4 py-2 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-navy-900 transition-all shadow-sm"

  const variantClasses = primary
    ? "bg-gradient-to-r from-gold-300 to-gold-500 hover:from-gold-400 hover:to-gold-500 text-navy-950 focus:ring-gold-300 disabled:opacity-50"
    : "bg-gradient-to-r from-navy-800 to-navy-700 hover:from-navy-700 hover:to-navy-600 text-navy-100 focus:ring-navy-500 disabled:opacity-50 border border-navy-600/20"

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses} ${className} ${disabled ? "cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  )
}
