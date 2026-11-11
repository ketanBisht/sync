/**
 * SYNC – Shared Types: SyncQueue
 *
 * The SyncQueue holds records that have been created or modified locally
 * while the device was offline and are waiting to be uploaded to the
 * central backend when internet connectivity becomes available.
 *
 * This is a future-phase concern but is included in the data model to
 * ensure the local database schema can accommodate it without migration.
 */

export type SyncEntityType = 'incident' | 'message' | 'incident_event' | 'message_receipt';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface SyncQueueEntry {
  /** UUID */
  queueId: string;

  entityType: SyncEntityType;

  /** UUID of the entity being synced */
  entityId: string;

  /**
   * JSON-encoded snapshot of the entity at time of queuing.
   * Stored here so the sync service does not need to re-read the entity
   * in case it has been subsequently updated or deleted locally.
   */
  payload: string;

  status: SyncStatus;

  /** ISO 8601 — when this entry was added to the queue */
  createdAt: string;

  /** ISO 8601 — most recent sync attempt */
  lastAttemptAt: string | null;

  /** Number of failed sync attempts. Used for exponential backoff. */
  attemptCount: number;
}

