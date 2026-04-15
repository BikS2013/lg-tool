import { Pool, PoolConfig } from 'pg';
import {
  ThreadRecord, RunRecord, CheckpointRecord,
  CheckpointBlobRecord, CheckpointWriteRecord,
  StoreRecord, ThreadExtraction, RetrievedDocument
} from './types.js';
import { DbError } from './errors.js';
import { maskConnectionString } from './formatters.js';

// ─── Pool Creation ───

/**
 * Create a PostgreSQL connection pool from a connection string.
 *
 * Pool configuration:
 *   - max: 6 connections (one per concurrent query in extractThreadData)
 *   - SSL: enabled when connection string contains sslmode=require
 *   - rejectUnauthorized: false for Azure PostgreSQL (Microsoft-managed certs)
 *
 * @param postgresUrl - Full PostgreSQL connection string
 * @returns Configured Pool instance
 */
export function createPool(postgresUrl: string): Pool {
  const poolConfig: PoolConfig = {
    connectionString: postgresUrl,
    max: 6,
  };

  // Enable SSL if the connection string requires it
  if (postgresUrl.includes('sslmode=require')) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  return new Pool(poolConfig);
}

// ─── SQL Queries (all parameterized, never use string interpolation) ───

const SQL_THREAD = 'SELECT * FROM thread WHERE thread_id = $1';

const SQL_RUNS = 'SELECT * FROM run WHERE thread_id = $1 ORDER BY created_at ASC';

const SQL_CHECKPOINTS = 'SELECT * FROM checkpoints WHERE thread_id = $1 ORDER BY checkpoint_id ASC';

const SQL_CHECKPOINT_BLOBS_META =
  'SELECT thread_id, channel, version, type, length(blob) as blob_size, checkpoint_ns FROM checkpoint_blobs WHERE thread_id = $1';

const SQL_CHECKPOINT_BLOBS_FULL =
  "SELECT thread_id, channel, version, type, length(blob) as blob_size, encode(blob, 'base64') as blob_base64, checkpoint_ns FROM checkpoint_blobs WHERE thread_id = $1";

const SQL_CHECKPOINT_WRITES_META =
  'SELECT thread_id, checkpoint_id, task_id, idx, channel, type, length(blob) as blob_size, checkpoint_ns FROM checkpoint_writes WHERE thread_id = $1 ORDER BY checkpoint_id, idx';

const SQL_CHECKPOINT_WRITES_FULL =
  "SELECT thread_id, checkpoint_id, task_id, idx, channel, type, length(blob) as blob_size, encode(blob, 'base64') as blob_base64, checkpoint_ns FROM checkpoint_writes WHERE thread_id = $1 ORDER BY checkpoint_id, idx";

const SQL_STORE = 'SELECT * FROM store WHERE prefix LIKE $1';

const SQL_RETRIEVED_DOCS =
  "SELECT encode(blob, 'base64') as blob_b64 FROM checkpoint_writes WHERE thread_id = $1 AND channel = 'retrieved_docs' ORDER BY checkpoint_id, idx";

// ─── Individual Query Functions ───

/**
 * Query the thread table for a single thread record.
 * Returns null if the thread does not exist.
 */
export async function queryThread(pool: Pool, threadId: string): Promise<ThreadRecord | null> {
  const result = await pool.query(SQL_THREAD, [threadId]);
  return (result.rows[0] as ThreadRecord) ?? null;
}

/**
 * Query the run table for all runs belonging to a thread.
 * Returns empty array if no runs exist.
 */
export async function queryRuns(pool: Pool, threadId: string): Promise<RunRecord[]> {
  const result = await pool.query(SQL_RUNS, [threadId]);
  return result.rows as RunRecord[];
}

/**
 * Query the checkpoints table for all checkpoints belonging to a thread.
 */
export async function queryCheckpoints(pool: Pool, threadId: string): Promise<CheckpointRecord[]> {
  const result = await pool.query(SQL_CHECKPOINTS, [threadId]);
  return result.rows as CheckpointRecord[];
}

/**
 * Query checkpoint_blobs table.
 * When includeBlobs is false: returns metadata only (channel, version, type, blob_size).
 * When includeBlobs is true: includes base64-encoded blob data via SQL encode().
 */
export async function queryCheckpointBlobs(
  pool: Pool,
  threadId: string,
  includeBlobs: boolean
): Promise<CheckpointBlobRecord[]> {
  const sql = includeBlobs ? SQL_CHECKPOINT_BLOBS_FULL : SQL_CHECKPOINT_BLOBS_META;
  const result = await pool.query(sql, [threadId]);
  return result.rows as CheckpointBlobRecord[];
}

/**
 * Query checkpoint_writes table.
 * Same blob handling as queryCheckpointBlobs.
 */
export async function queryCheckpointWrites(
  pool: Pool,
  threadId: string,
  includeBlobs: boolean
): Promise<CheckpointWriteRecord[]> {
  const sql = includeBlobs ? SQL_CHECKPOINT_WRITES_FULL : SQL_CHECKPOINT_WRITES_META;
  const result = await pool.query(sql, [threadId]);
  return result.rows as CheckpointWriteRecord[];
}

/**
 * Query the store table for entries whose prefix starts with the thread_id.
 * Note: Store entries may not be keyed by thread_id. An empty result is valid.
 */
export async function queryStore(pool: Pool, threadId: string): Promise<StoreRecord[]> {
  const result = await pool.query(SQL_STORE, [`${threadId}%`]);
  return result.rows as StoreRecord[];
}

/**
 * Extract retrieved documents from checkpoint_writes for a thread.
 *
 * LangGraph RAG agents store retrieved documents in the 'retrieved_docs' channel
 * as msgpack-encoded text containing <document: title='...' original_title='...' link='...'>
 * XML-like blocks. This function decodes the blobs and parses out document metadata.
 *
 * @param pool - PostgreSQL connection pool
 * @param threadId - UUID of the thread
 * @returns Array of RetrievedDocument with title, original_title, link, and content preview
 */
export async function queryRetrievedDocuments(
  pool: Pool,
  threadId: string
): Promise<RetrievedDocument[]> {
  const result = await pool.query(SQL_RETRIEVED_DOCS, [threadId]);
  const documents: RetrievedDocument[] = [];

  for (const row of result.rows) {
    const decoded = Buffer.from(row.blob_b64, 'base64').toString('utf-8');
    const docRegex = /<document:\s+title='([^']*)'\s+original_title='([^']*)'\s+link='([^']*)'>/g;
    let match;
    while ((match = docRegex.exec(decoded)) !== null) {
      const endTag = decoded.indexOf('</document>', match.index);
      const content = endTag > 0
        ? decoded.substring(match.index + match[0].length, endTag).trim()
        : '';

      documents.push({
        title: match[1],
        original_title: match[2],
        link: match[3],
        content_preview: content.substring(0, 200),
      });
    }
  }

  return documents;
}

// ─── Aggregate Extraction ───

/**
 * Extract all data for a thread from all 6 LangGraph tables concurrently.
 *
 * Uses Promise.all for parallel execution across 6 queries.
 * Each query is wrapped in a try/catch so that a missing table
 * (e.g., table does not exist in this LangGraph version) produces
 * a warning on stderr but does not abort the entire extraction.
 *
 * The bytea error column in the thread table is handled by pg,
 * which returns Buffer objects. These are converted to base64 strings
 * in the result.
 *
 * @param pool - PostgreSQL connection pool
 * @param threadId - UUID of the thread to extract
 * @param includeBlobs - Whether to include base64-encoded blob data
 * @returns ThreadExtraction object with all table data
 */
export async function extractThreadData(
  pool: Pool,
  threadId: string,
  includeBlobs: boolean
): Promise<ThreadExtraction> {
  // Helper: wrap a query in try/catch for graceful table-missing handling
  async function safeQuery<T>(
    label: string,
    queryFn: () => Promise<T>,
    fallback: T
  ): Promise<T> {
    try {
      return await queryFn();
    } catch (error) {
      const err = error as Error;
      console.error(`Warning: Failed to query ${label}: ${err.message}`);
      return fallback;
    }
  }

  const [thread, runs, checkpoints, checkpointBlobs, checkpointWrites, store] =
    await Promise.all([
      safeQuery('thread', () => queryThread(pool, threadId), null),
      safeQuery('run', () => queryRuns(pool, threadId), []),
      safeQuery('checkpoints', () => queryCheckpoints(pool, threadId), []),
      safeQuery('checkpoint_blobs', () => queryCheckpointBlobs(pool, threadId, includeBlobs), []),
      safeQuery('checkpoint_writes', () => queryCheckpointWrites(pool, threadId, includeBlobs), []),
      safeQuery('store', () => queryStore(pool, threadId), []),
    ]);

  // Convert any Buffer values to base64 (e.g., thread.error bytea column)
  if (thread && thread.error && Buffer.isBuffer(thread.error)) {
    thread.error = (thread.error as unknown as Buffer).toString('base64');
  }

  return {
    thread_id: threadId,
    extracted_at: new Date().toISOString(),
    thread,
    runs,
    checkpoints,
    checkpoint_blobs: checkpointBlobs,
    checkpoint_writes: checkpointWrites,
    store,
  };
}
