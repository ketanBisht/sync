/**
 * SYNC Mobile – Database Layer Public API
 *
 * Re-exports all database utilities and repositories.
 * Import from '@/db' rather than from individual files.
 */

export { getDatabase, closeDatabase } from './database';
export { ALL_SCHEMA_STATEMENTS } from './schema';
export { deviceRepository, DeviceRepository } from './repositories/deviceRepository';
export { messageRepository, MessageRepository, type SaveIncomingResult } from './repositories/messageRepository';
