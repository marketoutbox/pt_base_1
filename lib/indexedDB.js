import { openDB } from "idb"

const DB_NAME = "StockDatabase"
const STOCKS_STORE = "stocks"
const WATCHLISTS_STORE = "watchlists"

// Update the getDB function to handle version changes more gracefully
async function getDB() {
  return openDB(DB_NAME, 2, {
    upgrade(db, oldVersion, newVersion) {
      console.log(`Upgrading database from version ${oldVersion} to ${newVersion}`)

      // Create stocks store if it doesn't exist (for new installations)
      if (!db.objectStoreNames.contains(STOCKS_STORE)) {
        console.log("Creating stocks store")
        db.createObjectStore(STOCKS_STORE, { keyPath: "symbol" })
      }

      // Create watchlists store if it doesn't exist (only in version 2+)
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(WATCHLISTS_STORE)) {
          console.log("Creating watchlists store")
          db.createObjectStore(WATCHLISTS_STORE, { keyPath: "id" })
        }
      }
    },
  })
}

// Existing stock functions - unchanged
export async function saveStockData(symbol, data) {
  const db = await getDB()
  const tx = db.transaction(STOCKS_STORE, "readwrite")
  const store = tx.objectStore(STOCKS_STORE)
  await store.put({ symbol, data })
  await tx.done
}

export async function getStockData(symbol) {
  const db = await getDB()
  const tx = db.transaction(STOCKS_STORE, "readonly")
  const store = tx.objectStore(STOCKS_STORE)
  const result = await store.get(symbol)
  return result ? result.data : []
}

// New watchlist functions
export async function createWatchlist(name) {
  const id = Date.now().toString() // Simple unique ID
  const watchlist = {
    id,
    name,
    pairs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const db = await getDB()
  const tx = db.transaction(WATCHLISTS_STORE, "readwrite")
  const store = tx.objectStore(WATCHLISTS_STORE)
  await store.add(watchlist)
  await tx.done

  return watchlist
}

export async function getAllWatchlists() {
  const db = await getDB()
  const tx = db.transaction(WATCHLISTS_STORE, "readonly")
  const store = tx.objectStore(WATCHLISTS_STORE)
  return await store.getAll()
}

export async function getWatchlist(id) {
  const db = await getDB()
  const tx = db.transaction(WATCHLISTS_STORE, "readonly")
  const store = tx.objectStore(WATCHLISTS_STORE)
  return await store.get(id)
}

export async function updateWatchlist(watchlist) {
  watchlist.updatedAt = new Date().toISOString()

  const db = await getDB()
  const tx = db.transaction(WATCHLISTS_STORE, "readwrite")
  const store = tx.objectStore(WATCHLISTS_STORE)
  await store.put(watchlist)
  await tx.done

  return watchlist
}

export async function deleteWatchlist(id) {
  const db = await getDB()
  const tx = db.transaction(WATCHLISTS_STORE, "readwrite")
  const store = tx.objectStore(WATCHLISTS_STORE)
  await store.delete(id)
  await tx.done
}

export async function addPairToWatchlist(watchlistId, stockA, stockB) {
  const watchlist = await getWatchlist(watchlistId)
  if (!watchlist) throw new Error("Watchlist not found")

  // Check if pair already exists
  const pairExists = watchlist.pairs.some((pair) => pair.stockA === stockA && pair.stockB === stockB)

  if (!pairExists) {
    watchlist.pairs.push({ stockA, stockB })
    watchlist.updatedAt = new Date().toISOString()

    const db = await getDB()
    const tx = db.transaction(WATCHLISTS_STORE, "readwrite")
    const store = tx.objectStore(WATCHLISTS_STORE)
    await store.put(watchlist)
    await tx.done
  }

  return watchlist
}

export async function removePairFromWatchlist(watchlistId, stockA, stockB) {
  const watchlist = await getWatchlist(watchlistId)
  if (!watchlist) throw new Error("Watchlist not found")

  watchlist.pairs = watchlist.pairs.filter((pair) => !(pair.stockA === stockA && pair.stockB === stockB))
  watchlist.updatedAt = new Date().toISOString()

  const db = await getDB()
  const tx = db.transaction(WATCHLISTS_STORE, "readwrite")
  const store = tx.objectStore(WATCHLISTS_STORE)
  await store.put(watchlist)
  await tx.done

  return watchlist
}

export { getDB }
