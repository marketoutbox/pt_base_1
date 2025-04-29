"use client"

import { useState, useEffect } from "react"
import {
  createWatchlist,
  getAllWatchlists,
  deleteWatchlist,
  addPairToWatchlist,
  removePairFromWatchlist,
  getWatchlist,
  getDB,
} from "../lib/indexedDB"

export default function Watchlists() {
  const [watchlists, setWatchlists] = useState([])
  const [newWatchlistName, setNewWatchlistName] = useState("")
  const [selectedWatchlist, setSelectedWatchlist] = useState(null)
  const [newPair, setNewPair] = useState({ stockA: "", stockB: "" })
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState({ text: "", type: "" })

  // Load all watchlists on component mount
  useEffect(() => {
    // Check if window is defined (client-side)
    if (typeof window === "undefined") return

    async function loadWatchlists() {
      try {
        const allWatchlists = await getAllWatchlists()
        setWatchlists(allWatchlists)

        // Get all available stocks for dropdown selection
        const db = await getDB()
        const tx = db.transaction("stocks", "readonly")
        const store = tx.objectStore("stocks")
        const allStocks = await store.getAll()
        setStocks(allStocks.map((stock) => stock.symbol))

        setLoading(false)
      } catch (error) {
        console.error("Error loading watchlists:", error)
        setMessage({ text: "Failed to load watchlists", type: "error" })
        setLoading(false)
      }
    }

    loadWatchlists()
  }, [])

  // Create a new watchlist
  async function handleCreateWatchlist() {
    if (!newWatchlistName.trim()) {
      setMessage({ text: "Please enter a watchlist name", type: "error" })
      return
    }

    try {
      const watchlist = await createWatchlist(newWatchlistName)
      setWatchlists([...watchlists, watchlist])
      setNewWatchlistName("")
      setMessage({ text: "Watchlist created successfully", type: "success" })
    } catch (error) {
      console.error("Error creating watchlist:", error)
      setMessage({ text: "Failed to create watchlist", type: "error" })
    }
  }

  // Delete a watchlist
  async function handleDeleteWatchlist(id) {
    try {
      await deleteWatchlist(id)
      setWatchlists(watchlists.filter((w) => w.id !== id))
      if (selectedWatchlist?.id === id) {
        setSelectedWatchlist(null)
      }
      setMessage({ text: "Watchlist deleted successfully", type: "success" })
    } catch (error) {
      console.error("Error deleting watchlist:", error)
      setMessage({ text: "Failed to delete watchlist", type: "error" })
    }
  }

  // Select a watchlist to view/edit
  async function handleSelectWatchlist(id) {
    try {
      const watchlist = await getWatchlist(id)
      setSelectedWatchlist(watchlist)
    } catch (error) {
      console.error("Error selecting watchlist:", error)
      setMessage({ text: "Failed to load watchlist details", type: "error" })
    }
  }

  // Add a pair to the selected watchlist
  async function handleAddPair() {
    if (!selectedWatchlist) {
      setMessage({ text: "Please select a watchlist first", type: "error" })
      return
    }

    if (!newPair.stockA || !newPair.stockB) {
      setMessage({ text: "Please select both stocks for the pair", type: "error" })
      return
    }

    if (newPair.stockA === newPair.stockB) {
      setMessage({ text: "Please select different stocks for the pair", type: "error" })
      return
    }

    try {
      const updatedWatchlist = await addPairToWatchlist(selectedWatchlist.id, newPair.stockA, newPair.stockB)

      setSelectedWatchlist(updatedWatchlist)
      setWatchlists(watchlists.map((w) => (w.id === updatedWatchlist.id ? updatedWatchlist : w)))

      setNewPair({ stockA: "", stockB: "" })
      setMessage({ text: "Pair added successfully", type: "success" })
    } catch (error) {
      console.error("Error adding pair:", error)
      setMessage({ text: "Failed to add pair", type: "error" })
    }
  }

  // Remove a pair from the selected watchlist
  async function handleRemovePair(stockA, stockB) {
    try {
      const updatedWatchlist = await removePairFromWatchlist(selectedWatchlist.id, stockA, stockB)

      setSelectedWatchlist(updatedWatchlist)
      setWatchlists(watchlists.map((w) => (w.id === updatedWatchlist.id ? updatedWatchlist : w)))

      setMessage({ text: "Pair removed successfully", type: "success" })
    } catch (error) {
      console.error("Error removing pair:", error)
      setMessage({ text: "Failed to remove pair", type: "error" })
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center my-12">
        <svg
          className="animate-spin h-12 w-12 text-gold-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-bold text-white">Watchlists</h1>
        <p className="text-xl text-gray-300">Create and manage your pair trading watchlists</p>
      </div>

      {message.text && (
        <div
          className={`p-4 rounded-md ${
            message.type === "success"
              ? "bg-green-900/30 text-green-300 border border-green-800"
              : message.type === "error"
                ? "bg-red-900/30 text-red-300 border border-red-800"
                : "bg-yellow-900/30 text-yellow-300 border border-yellow-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Watchlist Management Panel */}
        <div className="card">
          <h2 className="text-2xl font-bold text-white mb-6">Your Watchlists</h2>

          <div className="space-y-4 mb-8">
            <div className="flex gap-2">
              <input
                type="text"
                value={newWatchlistName}
                onChange={(e) => setNewWatchlistName(e.target.value)}
                placeholder="New watchlist name"
                className="input-field flex-1"
              />
              <button onClick={handleCreateWatchlist} className="btn-primary whitespace-nowrap">
                Create
              </button>
            </div>
          </div>

          {watchlists.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No watchlists yet. Create your first one!</div>
          ) : (
            <div className="space-y-2">
              {watchlists.map((watchlist) => (
                <div
                  key={watchlist.id}
                  className={`p-3 rounded-md flex justify-between items-center cursor-pointer transition-colors ${
                    selectedWatchlist?.id === watchlist.id
                      ? "bg-navy-700 border border-navy-600"
                      : "bg-navy-800/50 hover:bg-navy-800 border border-navy-700"
                  }`}
                  onClick={() => handleSelectWatchlist(watchlist.id)}
                >
                  <div>
                    <h3 className="font-medium text-white">{watchlist.name}</h3>
                    <p className="text-sm text-gray-400">{watchlist.pairs.length} pairs</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteWatchlist(watchlist.id)
                    }}
                    className="text-red-400 hover:text-red-300 p-1"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Watchlist Details Panel */}
        <div className="card md:col-span-2">
          {selectedWatchlist ? (
            <>
              <h2 className="text-2xl font-bold text-white mb-6">{selectedWatchlist.name} - Pairs</h2>

              <div className="space-y-6">
                {/* Add new pair form */}
                <div className="bg-navy-800/50 p-4 rounded-md border border-navy-700">
                  <h3 className="text-lg font-medium text-white mb-3">Add New Pair</h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Stock A</label>
                      <select
                        value={newPair.stockA}
                        onChange={(e) => setNewPair({ ...newPair, stockA: e.target.value })}
                        className="input-field"
                      >
                        <option value="">Select Stock A</option>
                        {stocks.map((symbol) => (
                          <option key={`a-${symbol}`} value={symbol}>
                            {symbol}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Stock B</label>
                      <select
                        value={newPair.stockB}
                        onChange={(e) => setNewPair({ ...newPair, stockB: e.target.value })}
                        className="input-field"
                      >
                        <option value="">Select Stock B</option>
                        {stocks.map((symbol) => (
                          <option key={`b-${symbol}`} value={symbol}>
                            {symbol}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button onClick={handleAddPair} className="btn-primary w-full">
                    Add Pair
                  </button>
                </div>

                {/* Pairs list */}
                {selectedWatchlist.pairs.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    No pairs in this watchlist yet. Add your first pair!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedWatchlist.pairs.map((pair, index) => (
                      <div
                        key={index}
                        className="p-4 bg-navy-800/50 rounded-md border border-navy-700 flex justify-between items-center"
                      >
                        <div className="flex items-center">
                          <div className="bg-navy-700 p-2 rounded-md">
                            <span className="text-gold-400 font-medium">{pair.stockA}</span>
                          </div>
                          <span className="mx-3 text-gray-400">⟷</span>
                          <div className="bg-navy-700 p-2 rounded-md">
                            <span className="text-gold-400 font-medium">{pair.stockB}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemovePair(pair.stockA, pair.stockB)}
                          className="text-red-400 hover:text-red-300 p-1"
                          title="Remove Pair"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-16 w-16 mx-auto mb-4 text-navy-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                />
              </svg>
              <p className="text-lg">Select a watchlist to view and manage its pairs</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
