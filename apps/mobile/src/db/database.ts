/**
 * SYNC – Database Initialization
 *
 * Opens (or creates) the SQLite database file and provisions all tables.
 * This module exports a singleton `getDatabase()` function that returns
 * the initialized database instance.
 *
 * Usage:
 *   import { getDatabase } from '@/db/database';
 *   const db = await getDatabase();
 *   await db.execAsync('SELECT 1');
 *
 * Design decisions:
 * - WAL mode: enabled on native platforms for concurrent read performance.
 * - Foreign keys: enabled explicitly (SQLite disables them by default).
 * - Singleton promise pattern: prevents concurrent open calls from colliding
 *   on web OPFS (Origin Private File System) handles.
 * - Multi-tab OPFS resilience: on web, if an access handle is locked by another
 *   tab, gracefully falls back to an in-memory database (:memory:) for the session.
 */

import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { ALL_SCHEMA_STATEMENTS } from './schema';

const DATABASE_NAME = 'sync.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function initDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  // Enable Write-Ahead Logging on native platforms for concurrent reads
  if (Platform.OS !== 'web') {
    await db.execAsync('PRAGMA journal_mode = WAL;');
  }

  // Enable foreign key enforcement (disabled by default in SQLite)
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // Create all tables and indexes in a single transaction
  await db.withTransactionAsync(async () => {
    for (const statement of ALL_SCHEMA_STATEMENTS) {
      await db.execAsync(statement);
    }
  });
}

/**
 * Returns the initialized SQLite database instance.
 * Uses a single in-flight promise to prevent concurrent open calls.
 */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance !== null) {
    return Promise.resolve(dbInstance);
  }

  if (dbPromise !== null) {
    return dbPromise;
  }

  dbPromise = (async () => {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await initDatabase(db);
      dbInstance = db;
      return db;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // On web, if OPFS access handle is locked by another browser tab or stale handle,
      // fallback to in-memory SQLite so development & browsing can proceed seamlessly.
      if (Platform.OS === 'web' && (errMsg.includes('Access Handle') || errMsg.includes('NoModificationAllowedError'))) {
        console.warn(
          '[SYNC] Web OPFS database locked by another open tab. Falling back to in-memory SQLite (:memory:) for this session.'
        );
        try {
          const memDb = await SQLite.openDatabaseAsync(':memory:');
          await initDatabase(memDb);
          dbInstance = memDb;
          return memDb;
        } catch (fallbackErr) {
          dbPromise = null;
          throw fallbackErr;
        }
      }

      dbPromise = null;
      throw err;
    }
  })();

  return dbPromise;
}

/**
 * Closes the database connection and clears the singleton.
 * Call this during application teardown or in tests between runs.
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance !== null) {
    await dbInstance.closeAsync();
    dbInstance = null;
    dbPromise = null;
  }
}
