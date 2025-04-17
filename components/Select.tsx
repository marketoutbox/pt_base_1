"use client"

export default function Select({ value, onChange, children, className = "", ...props }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className={`w-full px-4 py-2 bg-gradient-to-b from-navy-900/60 to-navy-800/60 border border-navy-700/20 rounded-md text-navy-100 focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-transparent shadow-sm ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}
