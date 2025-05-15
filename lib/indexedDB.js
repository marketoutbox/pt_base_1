import { openDB, deleteDB } from "idb"

const DB_NAME = "StockDatabase"
const STOCKS_STORE = "stocks"
const WATCHLISTS_STORE = "watchlists"

// Update the getDB function to be more robust and handle connection caching
let dbPromise = null

async function getDB() {
  if (!dbPromise) {
    console.log("Creating new database connection")
    dbPromise = openDB(DB_NAME, 2, {
      upgrade(db, oldVersion, newVersion) {
        console.log(`Upgrading database from version ${oldVersion} to ${newVersion}`)

        // Create stocks store if it doesn't exist
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
      blocked(currentVersion, blockedVersion, event) {
        console.log(`Database blocked event:`, { currentVersion, blockedVersion, event })
      },
      blocking(currentVersion, blockedVersion, event) {
        console.log(`Database blocking event:`, { currentVersion, blockedVersion, event })
      },
      terminated() {
        console.log("Database connection terminated unexpectedly")
        dbPromise = null
      },
    })
  }

  return dbPromise
}

// Add a function to check if the database has all required stores
export async function checkDatabaseIntegrity() {
  try {
    const db = await getDB()
    const hasStocksStore = db.objectStoreNames.contains(STOCKS_STORE)
    const hasWatchlistsStore = db.objectStoreNames.contains(WATCHLISTS_STORE)

    return {
      isValid: hasStocksStore && hasWatchlistsStore,
      missingStores: [...(hasStocksStore ? [] : [STOCKS_STORE]), ...(hasWatchlistsStore ? [] : [WATCHLISTS_STORE])],
    }
  } catch (error) {
    console.error("Error checking database integrity:", error)
    return { isValid: false, missingStores: ["unknown"], error }
  }
}

// Add a function to reset the database
export async function resetDatabase() {
  try {
    // Close existing connection if any
    if (dbPromise) {
      const db = await dbPromise
      db.close()
      dbPromise = null
    }

    // Delete the database
    await deleteDB(DB_NAME)
    console.log("Database successfully deleted")

    // Create a fresh database
    const db = await getDB()
    console.log("Fresh database created with stores:", Array.from(db.objectStoreNames))

    return { success: true }
  } catch (error) {
    console.error("Error resetting database:", error)
    return { success: false, error }
  }
}

// Update the saveStockData function to handle errors better
export async function saveStockData(symbol, data) {
  try {
    const db = await getDB()

    // Check if the stocks store exists
    if (!db.objectStoreNames.contains(STOCKS_STORE)) {
      throw new Error(`Required object store '${STOCKS_STORE}' not found. Database may need to be reset.`)
    }

    const tx = db.transaction(STOCKS_STORE, "readwrite")
    const store = tx.objectStore(STOCKS_STORE)
    await store.put({ symbol, data })
    await tx.done
    return { success: true }
  } catch (error) {
    console.error(`Error saving stock data for ${symbol}:`, error)
    throw error
  }
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
