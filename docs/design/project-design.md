# lg-tool - Project Design

## Overview

lg-tool is a TypeScript CLI tool that provides five core operations against a LangGraph deployment:

1. **List agents** - Query and display available assistants/agents
2. **Create thread** - Create a new conversation thread
3. **Send request** - Submit a message to an agent and wait for a response
4. **Extract data** - Query the backing PostgreSQL database to extract all data related to a thread
5. **Extract documents** - Parse the `retrieved_docs` channel writes for a thread and list the documents used by its RAG pipeline

## Architecture

**Pattern**: Modular multi-file architecture with raw HTTP and direct PostgreSQL access

## Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Language | TypeScript | Project convention |
| Runtime | Node.js 18+ | Native fetch support |
| HTTP Client | Native `fetch` | Lightweight, transparent, zero dependency |
| Database | `pg` (node-postgres) | Standard PostgreSQL client for Node.js |
| CLI Framework | `commander` | Standard CLI parsing with subcommand support |
| Config | `dotenv` | .env file loading |
| Execution | `tsx` | TypeScript execution for development |

---

## 1. File Structure

```
lg-tool/
  package.json                    # Project metadata, scripts, dependencies, engines
  tsconfig.json                   # TypeScript config (ES2022, NodeNext, strict)
  .gitignore                      # node_modules, dist, .env, *.js in src
  .env.example                    # Example env file (no real credentials)
  CLAUDE.md                       # Project documentation and tool registry
  Issues - Pending Items.md       # Issue tracker
  src/
    cli.ts                        # Entry point: commander program setup, subcommand registration
    types.ts                      # All TypeScript interfaces and type definitions
    config.ts                     # loadServerConfig(), loadDbConfig() with strict validation
    api-client.ts                 # Generic apiRequest<T>(), searchAssistants(), createThread(), runAndWait()
    db-client.ts                  # createPool(), extractThreadData(), individual query functions
    utils.ts                      # validateUuid(), UUID_REGEX constant
    formatters.ts                 # formatAgentsTable(), formatThreadResult(), formatRunResult(), maskConnectionString()
    errors.ts                     # Custom error classes: ConfigError, ApiError, DbError, ValidationError
    commands/
      agents.ts                   # "agents" command handler
      thread-create.ts            # "thread-create" command handler
      run.ts                      # "run" command handler
      extract.ts                  # "extract" command handler
      documents.ts                # "documents" command handler (FR-5)
  test_scripts/
    test-e2e.ts                   # Full flow: list agents -> create thread -> run -> extract
    test-config.ts                # Config module validation tests
    test-utils.ts                 # UUID validation, masking, formatting tests
    test-documents.ts             # documents-command unit tests (no live DB)
  docs/
    design/
      project-design.md           # This document
      project-functions.md        # Functional requirements registry
      plan-001-lg-tool-implementation.md  # Implementation plan
    reference/
      refined-request-lg-tool.md          # Full requirements specification
      investigation-lg-tool.md            # Technical investigation
      langgraph-server-api-spec.md        # LangGraph Platform REST API reference
      samples/                            # Captured fixtures for regression
```

**Total source files**: 13 (in `src/` — 8 root modules + 5 command handlers)
**Total test files**: 4 (in `test_scripts/`)
**Total project files**: 19 (including config files)

---

## 2. Module Design

### 2.1 `src/types.ts` - Type Definitions

This module exports all shared TypeScript interfaces. It has zero runtime code and zero imports.

```typescript
// ─── Configuration Types ───

export interface ServerConfig {
  serverUrl: string;  // LANGGRAPH_SERVER_URL, no trailing slash
}

export interface DbConfig {
  postgresUrl: string;  // LANGGRAPH_POSTGRES_URL, full connection string
}

// ─── LangGraph API Types ───

export interface Assistant {
  assistant_id: string;     // UUID
  graph_id: string;         // e.g. "agent"
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;       // ISO 8601 datetime
  updated_at: string;       // ISO 8601 datetime
  version: number;          // integer
  name: string;             // display name
  description: string | null;
}

export interface Thread {
  thread_id: string;        // UUID
  created_at: string;       // ISO 8601 datetime
  updated_at: string;       // ISO 8601 datetime
  metadata: Record<string, unknown>;
  status: 'idle' | 'busy' | 'interrupted' | 'error';
  config: Record<string, unknown>;
  values: Record<string, unknown>;
}

export interface Message {
  // Both fields are optional because LangGraph responses use `type`
  // (e.g. "ai") while the LangGraph REST request format uses `role`.
  // Consumers (see formatters.ts) read `m.type ?? m.role`.
  role?: 'human' | 'ai' | 'system' | 'tool';
  type?: 'human' | 'ai' | 'system' | 'tool';
  content: string;
  id?: string;
  name?: string;
  tool_calls?: unknown[];
  additional_kwargs?: Record<string, unknown>;
  response_metadata?: Record<string, unknown>;
}

export interface RunResult {
  messages: Message[];
  [key: string]: unknown;   // Additional state fields returned by the agent
}

// ─── API Client Types ───

export interface ApiRequestOptions {
  method: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
}

// ─── Database Record Types ───

export interface ThreadRecord {
  thread_id: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
  status: string;
  config: Record<string, unknown> | null;
  values: Record<string, unknown> | null;
  interrupts: Record<string, unknown> | null;
  error: string | null;       // base64 if bytea, null otherwise
  state_updated_at: string | null;
}

export interface RunRecord {
  run_id: string;
  thread_id: string;
  assistant_id: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
  status: string;
  kwargs: Record<string, unknown> | null;
  multitask_strategy: string | null;
}

export interface CheckpointRecord {
  thread_id: string;
  checkpoint_id: string;
  run_id: string | null;
  parent_checkpoint_id: string | null;
  checkpoint: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  checkpoint_ns: string;
}

export interface CheckpointBlobRecord {
  thread_id: string;
  channel: string;
  version: string;
  type: string;
  blob_size: number;          // from length(blob)
  checkpoint_ns: string;
  blob_base64?: string;       // only present when --include-blobs
}

export interface CheckpointWriteRecord {
  thread_id: string;
  checkpoint_id: string;
  task_id: string;
  idx: number;
  channel: string;
  type: string;
  blob_size: number;          // from length(blob)
  checkpoint_ns: string;
  blob_base64?: string;       // only present when --include-blobs
}

export interface StoreRecord {
  [key: string]: unknown;     // Schema may vary
}

// ─── Retrieved Document Type (FR-5) ───

export interface RetrievedDocument {
  title: string;
  original_title: string;
  link: string;
  content_preview: string;    // first 200 chars of the document body
}

// ─── Extract Result Type ───

export interface ThreadExtraction {
  thread_id: string;
  extracted_at: string;       // ISO 8601 datetime
  thread: ThreadRecord | null;
  runs: RunRecord[];
  checkpoints: CheckpointRecord[];
  checkpoint_blobs: CheckpointBlobRecord[];
  checkpoint_writes: CheckpointWriteRecord[];
  store: StoreRecord[];
}
```

### 2.2 `src/errors.ts` - Custom Error Classes

```typescript
/**
 * Base error class for lg-tool.
 * All custom errors extend this.
 */
export class LgToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LgToolError';
  }
}

/**
 * Thrown when a required configuration variable is missing.
 * Never catches or provides fallback. Exits the CLI immediately.
 */
export class ConfigError extends LgToolError {
  public readonly variableName: string;

  constructor(variableName: string) {
    super(`${variableName} environment variable is required`);
    this.name = 'ConfigError';
    this.variableName = variableName;
  }
}

/**
 * Thrown on HTTP errors from the LangGraph REST API.
 * Includes status code and response body for debugging.
 */
export class ApiError extends LgToolError {
  public readonly statusCode: number;
  public readonly responseBody: string;
  public readonly url: string;

  constructor(url: string, statusCode: number, responseBody: string) {
    super(`API error ${statusCode} from ${url}: ${responseBody}`);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.url = url;
  }
}

/**
 * Thrown on PostgreSQL connection or query errors.
 * The message MUST NOT contain credentials. Use maskConnectionString()
 * before including any connection URL in the message.
 */
export class DbError extends LgToolError {
  public readonly originalError: Error;
  public readonly table?: string;

  constructor(message: string, originalError: Error, table?: string) {
    super(message);
    this.name = 'DbError';
    this.originalError = originalError;
    this.table = table;
  }
}

/**
 * Thrown when user input fails validation (e.g., invalid UUID, malformed JSON).
 */
export class ValidationError extends LgToolError {
  public readonly field: string;
  public readonly value: string;

  constructor(field: string, value: string, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}
```

### 2.3 `src/config.ts` - Configuration Module

**Exports**:
- `loadServerConfig(): ServerConfig`
- `loadDbConfig(): DbConfig`

**Design rules**:
- No default values. No fallback values. Ever.
- Each function loads only the variables it needs.
- `.env` loading order: CWD first, then `~/.lg-tool/.env`. Environment variables override both.
- Throws `ConfigError` immediately on missing variable.

```typescript
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import { ServerConfig, DbConfig } from './types.js';
import { ConfigError } from './errors.js';

/**
 * Load .env files in priority order.
 * dotenv.config() does NOT overwrite existing env vars,
 * so env vars set in the shell always take precedence.
 *
 * Load order:
 *   1. process.env (already set, highest priority)
 *   2. .env in current working directory
 *   3. ~/.lg-tool/.env
 */
function loadEnvFiles(): void {
  dotenv.config({ path: path.join(process.cwd(), '.env') });
  dotenv.config({ path: path.join(os.homedir(), '.lg-tool', '.env') });
}

/**
 * Load server configuration. Requires LANGGRAPH_SERVER_URL.
 * Does NOT require LANGGRAPH_POSTGRES_URL.
 *
 * @throws ConfigError if LANGGRAPH_SERVER_URL is not set
 */
export function loadServerConfig(): ServerConfig {
  loadEnvFiles();

  const serverUrl = process.env.LANGGRAPH_SERVER_URL;
  if (!serverUrl) {
    throw new ConfigError('LANGGRAPH_SERVER_URL');
  }

  // Remove trailing slash for consistent URL construction
  return { serverUrl: serverUrl.replace(/\/+$/, '') };
}

/**
 * Load database configuration. Requires LANGGRAPH_POSTGRES_URL.
 * Does NOT require LANGGRAPH_SERVER_URL.
 *
 * @throws ConfigError if LANGGRAPH_POSTGRES_URL is not set
 */
export function loadDbConfig(): DbConfig {
  loadEnvFiles();

  const postgresUrl = process.env.LANGGRAPH_POSTGRES_URL;
  if (!postgresUrl) {
    throw new ConfigError('LANGGRAPH_POSTGRES_URL');
  }

  return { postgresUrl };
}
```

### 2.4 `src/utils.ts` - Utility Functions

**Exports**:
- `UUID_REGEX: RegExp`
- `validateUuid(value: string, fieldName: string): string`

```typescript
import { ValidationError } from './errors.js';

/**
 * Regular expression for UUID v4 format validation.
 * Accepts both uppercase and lowercase hex digits.
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID format.
 * Returns the value if valid, throws ValidationError if not.
 *
 * @param value - The string to validate
 * @param fieldName - Name of the field (for error message), e.g. "--thread"
 * @returns The validated UUID string
 * @throws ValidationError if the value is not a valid UUID
 */
export function validateUuid(value: string, fieldName: string): string {
  if (!UUID_REGEX.test(value)) {
    throw new ValidationError(fieldName, value, `Invalid UUID for ${fieldName}: "${value}"`);
  }
  return value;
}
```

### 2.5 `src/formatters.ts` - Output Formatting

**Exports**:
- `formatAgentsTable(assistants: Assistant[]): string`
- `formatThreadResult(thread: Thread): string`
- `formatRunResult(result: RunResult, runId: string): string`
- `maskConnectionString(url: string): string`

```typescript
import { Assistant, Thread, RunResult, Message } from './types.js';

/**
 * Format assistants into a readable terminal table.
 * Uses fixed-width columns aligned for terminal output.
 *
 * Columns: assistant_id | graph_id | name | description | version | created_at | updated_at
 *
 * Implementation approach:
 *   1. Define column headers and max widths
 *   2. Calculate actual widths from data (min of max-width and longest value)
 *   3. Pad each cell with spaces
 *   4. Join with ' | ' separator
 *   5. Add header underline row
 */
export function formatAgentsTable(assistants: Assistant[]): string {
  if (assistants.length === 0) {
    return 'No assistants found.';
  }

  const columns = [
    { key: 'assistant_id' as const, header: 'ASSISTANT_ID', width: 36 },
    { key: 'graph_id' as const, header: 'GRAPH_ID', width: 20 },
    { key: 'name' as const, header: 'NAME', width: 20 },
    { key: 'description' as const, header: 'DESCRIPTION', width: 30 },
    { key: 'version' as const, header: 'VERSION', width: 7 },
    { key: 'created_at' as const, header: 'CREATED_AT', width: 24 },
    { key: 'updated_at' as const, header: 'UPDATED_AT', width: 24 },
  ];

  const headerLine = columns.map(c => c.header.padEnd(c.width)).join(' | ');
  const separatorLine = columns.map(c => '-'.repeat(c.width)).join('-+-');

  const dataLines = assistants.map(a => {
    return columns.map(c => {
      const val = String(a[c.key] ?? '');
      return val.length > c.width ? val.substring(0, c.width - 3) + '...' : val.padEnd(c.width);
    }).join(' | ');
  });

  return [headerLine, separatorLine, ...dataLines].join('\n');
}

/**
 * Format thread creation result for display.
 */
export function formatThreadResult(thread: Thread): string {
  const lines = [
    `Thread created successfully.`,
    `  thread_id:  ${thread.thread_id}`,
    `  status:     ${thread.status}`,
    `  created_at: ${thread.created_at}`,
    `  metadata:   ${JSON.stringify(thread.metadata)}`,
  ];
  return lines.join('\n');
}

/**
 * Format run result for display.
 * Extracts the last AI message from the messages array.
 *
 * @param result - The RunResult from the /runs/wait endpoint
 * @param runId - Extracted from response headers or the run state
 */
export function formatRunResult(result: RunResult, runId: string): string {
  const lines: string[] = [];

  lines.push(`Run completed.`);
  lines.push(`  run_id: ${runId}`);
  lines.push('');

  // Extract AI messages from the result.
  // LangGraph uses "type" field (e.g. "ai"), while the REST request format uses "role".
  // getRole() prefers `type` and falls back to `role` so both shapes are handled.
  if (result.messages && Array.isArray(result.messages)) {
    const getRole = (m: Message): string => m.type ?? m.role ?? 'unknown';
    const aiMessages = result.messages.filter((m: Message) => getRole(m) === 'ai');
    if (aiMessages.length > 0) {
      lines.push('Agent Response:');
      for (const msg of aiMessages) {
        lines.push(`  [${getRole(msg)}] ${msg.content}`);
      }
    } else {
      lines.push('No AI messages in response.');
    }
  } else {
    lines.push('Response state:');
    lines.push(JSON.stringify(result, null, 2));
  }

  return lines.join('\n');
}

/**
 * Mask credentials in a PostgreSQL connection string.
 * Replaces the password portion with '***'.
 *
 * Input:  postgresql://user:secretpass@host:5432/db?sslmode=require
 * Output: postgresql://user:***@host:5432/db?sslmode=require
 *
 * If the URL cannot be parsed, returns '***masked***' to prevent any leakage.
 */
export function maskConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '***masked***';
  }
}
```

### 2.6 `src/api-client.ts` - LangGraph REST API Client

**Exports**:
- `apiRequest<T>(serverUrl: string, path: string, options: ApiRequestOptions): Promise<T>`
- `searchAssistants(serverUrl: string): Promise<Assistant[]>`
- `createThread(serverUrl: string, metadata?: Record<string, unknown>): Promise<Thread>`
- `runAndWait(serverUrl: string, threadId: string, assistantId: string, message: string): Promise<{ result: RunResult; runId: string }>`

**Design**:

```typescript
import { Assistant, Thread, RunResult, ApiRequestOptions } from './types.js';
import { ApiError } from './errors.js';

// ─── Constants ───

const DEFAULT_TIMEOUT_MS = 30_000;     // 30 seconds for standard endpoints
const RUN_WAIT_TIMEOUT_MS = 300_000;   // 5 minutes for /runs/wait

// ─── Generic API Request ───

/**
 * Generic HTTP request function for the LangGraph REST API.
 *
 * Uses native fetch with AbortController for timeout enforcement.
 * All requests send and expect JSON. Non-2xx responses throw ApiError.
 *
 * @param serverUrl - Base URL of the LangGraph server (no trailing slash)
 * @param path - API path (e.g., "/assistants/search")
 * @param options - HTTP method, optional body, optional timeout
 * @returns Parsed JSON response typed as T
 * @throws ApiError on non-2xx response
 * @throws ApiError on network/timeout error (wrapped with status 0)
 */
export async function apiRequest<T>(
  serverUrl: string,
  path: string,
  options: ApiRequestOptions
): Promise<T> {
  const url = `${serverUrl}${path}`;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method,
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ApiError(url, response.status, text);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(url, 0, `Request timed out after ${timeoutMs}ms`);
    }
    // Network errors (ECONNREFUSED, DNS failures, etc.)
    throw new ApiError(url, 0, `Network error: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// ─── Specialized API Functions ───

/**
 * List all available assistants/agents on the LangGraph server.
 *
 * Endpoint: POST /assistants/search
 * Body: { "limit": 100 }
 */
export async function searchAssistants(serverUrl: string): Promise<Assistant[]> {
  return apiRequest<Assistant[]>(serverUrl, '/assistants/search', {
    method: 'POST',
    body: { limit: 100 },
  });
}

/**
 * Create a new thread on the LangGraph server.
 *
 * Endpoint: POST /threads
 * Body: { "metadata": {...} } (metadata is optional)
 */
export async function createThread(
  serverUrl: string,
  metadata?: Record<string, unknown>
): Promise<Thread> {
  const body: Record<string, unknown> = {};
  if (metadata) {
    body.metadata = metadata;
  }
  return apiRequest<Thread>(serverUrl, '/threads', {
    method: 'POST',
    body,
  });
}

/**
 * Send a message to an agent within a thread and wait for completion.
 *
 * Endpoint: POST /threads/{threadId}/runs/wait
 * Body: { "assistant_id": "...", "input": { "messages": [{ "role": "human", "content": "..." }] } }
 *
 * This endpoint blocks until the agent run completes.
 * Uses a 300-second timeout to accommodate long-running agents and Azure proxy limits.
 *
 * Note: The /runs/wait endpoint returns the final thread state (including messages),
 * not a Run object. The run_id must be extracted from the response headers or
 * from a subsequent query. If the response includes a top-level object with
 * run metadata, extract run_id from there. Otherwise, query
 * GET /threads/{threadId}/runs after completion to get the run_id.
 *
 * @returns An object containing the RunResult and the run_id
 */
export async function runAndWait(
  serverUrl: string,
  threadId: string,
  assistantId: string,
  message: string
): Promise<{ result: RunResult; runId: string }> {
  const result = await apiRequest<RunResult>(
    serverUrl,
    `/threads/${threadId}/runs/wait`,
    {
      method: 'POST',
      body: {
        assistant_id: assistantId,
        input: {
          messages: [{ role: 'human', content: message }],
        },
      },
      timeoutMs: RUN_WAIT_TIMEOUT_MS,
    }
  );

  // Attempt to extract run_id from the last AI message metadata
  // or fall back to querying the runs list
  let runId = 'unknown';

  // Strategy: query the runs endpoint to get the latest run_id
  try {
    const runs = await apiRequest<Array<{ run_id: string }>>(
      serverUrl,
      `/threads/${threadId}/runs`,
      { method: 'GET' }
    );
    if (runs.length > 0) {
      // Runs are typically returned newest-first
      runId = runs[0].run_id;
    }
  } catch {
    // Non-critical: run_id is informational
  }

  return { result, runId };
}
```

### 2.7 `src/db-client.ts` - PostgreSQL Data Extraction

**Exports**:
- `createPool(postgresUrl: string): Pool`
- `queryThread(pool: Pool, threadId: string): Promise<ThreadRecord | null>`
- `queryRuns(pool: Pool, threadId: string): Promise<RunRecord[]>`
- `queryCheckpoints(pool: Pool, threadId: string): Promise<CheckpointRecord[]>`
- `queryCheckpointBlobs(pool: Pool, threadId: string, includeBlobs: boolean): Promise<CheckpointBlobRecord[]>`
- `queryCheckpointWrites(pool: Pool, threadId: string, includeBlobs: boolean): Promise<CheckpointWriteRecord[]>`
- `queryStore(pool: Pool, threadId: string): Promise<StoreRecord[]>`
- `queryRetrievedDocuments(pool: Pool, threadId: string): Promise<RetrievedDocument[]>` *(FR-5)*
- `extractThreadData(pool: Pool, threadId: string, includeBlobs: boolean): Promise<ThreadExtraction>`

**FR-5 query notes**:
- SQL: `SELECT encode(blob, 'base64') as blob_b64 FROM checkpoint_writes WHERE thread_id = $1 AND channel = 'retrieved_docs' ORDER BY checkpoint_id, idx`.
- For each returned row, the base64 blob is decoded to UTF-8 and scanned with the regex `/<document:\s+title='([^']*)'\s+original_title='([^']*)'\s+link='([^']*)'>/g`. Body content is captured between each opening match and the next `</document>` tag, then truncated to 200 chars for `content_preview`.
- The function does not throw on empty results; an empty array is a valid outcome (no RAG documents were retrieved during the thread).

**Design**:

```typescript
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
 * Extract retrieved RAG documents from checkpoint_writes for a thread (FR-5).
 *
 * LangGraph RAG agents store retrieved documents in the 'retrieved_docs' channel
 * as msgpack-encoded text containing <document: title='...' original_title='...' link='...'>
 * XML-like blocks. This function decodes the blobs and parses out document metadata.
 *
 * An empty result array is a valid outcome — it simply means no RAG documents
 * were retrieved during this thread's execution.
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
```

### 2.8 `src/commands/agents.ts` - Agents Command Handler

```typescript
import { loadServerConfig } from '../config.js';
import { searchAssistants } from '../api-client.js';
import { formatAgentsTable } from '../formatters.js';

/**
 * Handler for: lg-tool agents
 *
 * 1. Load server config (throws if LANGGRAPH_SERVER_URL not set)
 * 2. Call POST /assistants/search with limit 100
 * 3. Format results as terminal table
 * 4. Print to stdout
 */
export async function agentsCommand(): Promise<void> {
  const config = loadServerConfig();
  const assistants = await searchAssistants(config.serverUrl);
  console.log(formatAgentsTable(assistants));
}
```

### 2.9 `src/commands/thread-create.ts` - Thread Create Command Handler

```typescript
import { loadServerConfig } from '../config.js';
import { createThread } from '../api-client.js';
import { formatThreadResult } from '../formatters.js';
import { ValidationError } from '../errors.js';

interface ThreadCreateOptions {
  metadata?: string;  // Raw JSON string from CLI
}

/**
 * Handler for: lg-tool thread-create [--metadata <json>]
 *
 * 1. Load server config
 * 2. Parse --metadata JSON (if provided)
 * 3. Call POST /threads
 * 4. Print thread details
 */
export async function threadCreateCommand(options: ThreadCreateOptions): Promise<void> {
  const config = loadServerConfig();

  let metadata: Record<string, unknown> | undefined;
  if (options.metadata) {
    try {
      metadata = JSON.parse(options.metadata);
    } catch {
      throw new ValidationError(
        '--metadata',
        options.metadata,
        `Invalid JSON for --metadata: "${options.metadata}"`
      );
    }
  }

  const thread = await createThread(config.serverUrl, metadata);
  console.log(formatThreadResult(thread));
}
```

### 2.10 `src/commands/run.ts` - Run Command Handler

```typescript
import { loadServerConfig } from '../config.js';
import { runAndWait } from '../api-client.js';
import { formatRunResult } from '../formatters.js';
import { validateUuid } from '../utils.js';

interface RunOptions {
  thread: string;
  assistant: string;
  message: string;
}

/**
 * Handler for: lg-tool run --thread <id> --assistant <id> --message <text>
 *
 * 1. Load server config
 * 2. Validate --thread UUID (--assistant can be UUID or graph_id)
 * 3. Print "Waiting for agent response..." since /runs/wait blocks
 * 4. Call POST /threads/{id}/runs/wait
 * 5. Print agent response and run_id
 */
export async function runCommand(options: RunOptions): Promise<void> {
  const config = loadServerConfig();

  // Validate thread UUID (required to be UUID)
  validateUuid(options.thread, '--thread');

  // Note: --assistant accepts UUID or graph_id, so we do NOT validate it as UUID.
  // The API will reject invalid values with a descriptive error.

  console.log('Waiting for agent response...');

  const { result, runId } = await runAndWait(
    config.serverUrl,
    options.thread,
    options.assistant,
    options.message
  );

  console.log(formatRunResult(result, runId));
}
```

### 2.11 `src/commands/extract.ts` - Extract Command Handler

```typescript
import fs from 'fs/promises';
import { loadDbConfig } from '../config.js';
import { createPool, extractThreadData } from '../db-client.js';
import { validateUuid } from '../utils.js';
import { maskConnectionString } from '../formatters.js';
import { DbError } from '../errors.js';

interface ExtractOptions {
  thread: string;
  output?: string;
  includeBlobs?: boolean;
}

/**
 * Handler for: lg-tool extract --thread <id> [--output <file>] [--include-blobs]
 *
 * 1. Load DB config
 * 2. Validate --thread UUID
 * 3. Create connection pool
 * 4. Run 6 concurrent queries via extractThreadData()
 * 5. Output JSON to stdout or to --output file
 * 6. Close pool
 */
export async function extractCommand(options: ExtractOptions): Promise<void> {
  const config = loadDbConfig();

  validateUuid(options.thread, '--thread');

  const pool = createPool(config.postgresUrl);

  try {
    const extraction = await extractThreadData(
      pool,
      options.thread,
      options.includeBlobs ?? false
    );

    const json = JSON.stringify(extraction, null, 2);

    if (options.output) {
      await fs.writeFile(options.output, json, 'utf-8');
      console.log(`Extraction written to ${options.output}`);
    } else {
      console.log(json);
    }
  } catch (error) {
    if (error instanceof DbError) throw error;
    const err = error as Error;
    throw new DbError(
      `Database error: ${err.message} (connection: ${maskConnectionString(config.postgresUrl)})`,
      err
    );
  } finally {
    await pool.end();
  }
}
```

### 2.12 `src/commands/documents.ts` - Documents Command Handler (FR-5)

**Exports**: `documentsCommand(options: { thread: string; output?: string }): Promise<void>`

**Behavior**:
1. Load DB config (throws `ConfigError` if `LANGGRAPH_POSTGRES_URL` missing)
2. Validate `--thread` is a UUID
3. Open a `pg` pool, call `queryRetrievedDocuments(pool, threadId)` from `db-client.ts`
4. The query reads `checkpoint_writes` rows whose channel is `retrieved_docs`,
   parses each payload's `<document title='…' original_title='…' link='…'>…</document>`
   blocks, and returns `{ title, original_title, link, content_preview }[]`
5. If `--output` is supplied, write `{ thread_id, extracted_at, document_count, documents }`
   as pretty JSON; otherwise print a numbered list to stdout
6. If no documents found, print an informational message and return
7. Always close the pool in `finally`. Errors get wrapped in `DbError` with the
   connection string masked via `maskConnectionString()`

```typescript
import fs from 'fs/promises';
import { loadDbConfig } from '../config.js';
import { createPool, queryRetrievedDocuments } from '../db-client.js';
import { validateUuid } from '../utils.js';
import { maskConnectionString } from '../formatters.js';
import { DbError } from '../errors.js';

interface DocumentsOptions {
  thread: string;
  output?: string;
}

export async function documentsCommand(options: DocumentsOptions): Promise<void> {
  const config = loadDbConfig();

  validateUuid(options.thread, '--thread');

  const pool = createPool(config.postgresUrl);

  try {
    const documents = await queryRetrievedDocuments(pool, options.thread);

    if (documents.length === 0) {
      console.log('No retrieved documents found for this thread.');
      return;
    }

    const result = {
      thread_id: options.thread,
      extracted_at: new Date().toISOString(),
      document_count: documents.length,
      documents,
    };

    if (options.output) {
      const json = JSON.stringify(result, null, 2);
      await fs.writeFile(options.output, json, 'utf-8');
      console.log(`${documents.length} documents extracted to ${options.output}`);
    } else {
      console.log(`Found ${documents.length} retrieved documents for thread ${options.thread}:\n`);
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        console.log(`  ${i + 1}. ${doc.title}`);
        if (doc.link)           console.log(`     link: ${doc.link}`);
        if (doc.original_title) console.log(`     original_title: ${doc.original_title}`);
        const firstLine = doc.content_preview.split('\n')[0].trim();
        if (firstLine) {
          console.log(`     preview: ${firstLine.substring(0, 100)}${firstLine.length > 100 ? '...' : ''}`);
        }
        console.log('');
      }
    }
  } catch (error) {
    if (error instanceof DbError) throw error;
    const err = error as Error;
    throw new DbError(
      `Database error: ${err.message} (connection: ${maskConnectionString(config.postgresUrl)})`,
      err
    );
  } finally {
    await pool.end();
  }
}
```

### 2.13 `src/cli.ts` - Entry Point

```typescript
#!/usr/bin/env node

import { Command } from 'commander';
import { agentsCommand } from './commands/agents.js';
import { threadCreateCommand } from './commands/thread-create.js';
import { runCommand } from './commands/run.js';
import { extractCommand } from './commands/extract.js';
import { documentsCommand } from './commands/documents.js';
import { LgToolError } from './errors.js';

const program = new Command();

program
  .name('lg-tool')
  .description('CLI tool for interacting with LangGraph servers and inspecting their PostgreSQL data')
  .version('1.0.0');

program
  .command('agents')
  .description('List all available agents/assistants')
  .action(async () => {
    await agentsCommand();
  });

program
  .command('thread-create')
  .description('Create a new thread')
  .option('--metadata <json>', 'JSON metadata to attach to the thread')
  .action(async (options) => {
    await threadCreateCommand(options);
  });

program
  .command('run')
  .description('Send a request to an agent')
  .requiredOption('--thread <id>', 'Thread ID (UUID)')
  .requiredOption('--assistant <id>', 'Assistant ID (UUID or graph_id)')
  .requiredOption('--message <text>', 'Message to send to the agent')
  .action(async (options) => {
    await runCommand(options);
  });

program
  .command('extract')
  .description('Extract all thread data from PostgreSQL')
  .requiredOption('--thread <id>', 'Thread ID (UUID)')
  .option('--output <file>', 'Output file path for JSON')
  .option('--include-blobs', 'Include base64-encoded blob data')
  .action(async (options) => {
    await extractCommand(options);
  });

program
  .command('documents')
  .description('Extract retrieved documents used in a thread')
  .requiredOption('--thread <id>', 'Thread ID (UUID)')
  .option('--output <file>', 'Output file path for JSON')
  .action(async (options) => {
    await documentsCommand(options);
  });

// ─── Global Error Handler ───

/**
 * All command handlers throw typed errors. This top-level handler
 * catches them and produces user-friendly output.
 *
 * - ConfigError: prints the specific missing variable message
 * - ValidationError: prints what was wrong with the input
 * - ApiError: prints the HTTP status and response
 * - DbError: prints the DB error with masked credentials
 * - Unknown errors: prints the stack trace for debugging
 */
program.parseAsync().catch((error: unknown) => {
  if (error instanceof LgToolError) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
  // Unknown/unexpected error - show full stack for debugging
  console.error('Unexpected error:', error);
  process.exit(2);
});
```

---

## 3. Configuration Design

### Environment Variables

| Variable | Required By | Purpose | Example |
|----------|------------|---------|---------|
| `LANGGRAPH_SERVER_URL` | agents, thread-create, run | Base URL of LangGraph server | `https://host.azurewebsites.net` |
| `LANGGRAPH_POSTGRES_URL` | extract, documents | PostgreSQL connection string | `postgresql://user:pass@host:5432/db?sslmode=require` |

### Loading Priority (highest to lowest)

1. Shell environment variables (e.g., `export LANGGRAPH_SERVER_URL=...`)
2. `.env` file in the current working directory
3. `~/.lg-tool/.env` file

This priority is achieved automatically by `dotenv.config()`, which does NOT overwrite existing `process.env` values. Files loaded later also do not overwrite earlier ones.

### Rules

- **No defaults**: Every required variable MUST be explicitly set. Missing variables throw `ConfigError`.
- **No fallbacks**: If a `.env` file is missing, that is fine. But if the variable is not set by any source, the tool errors.
- **Lazy loading**: `loadServerConfig()` does not check for `LANGGRAPH_POSTGRES_URL` and vice versa. This prevents the `agents` command from failing when only the server URL is configured.

---

## 4. Error Handling Strategy

### Error Class Hierarchy

```
Error
  LgToolError           (base class for all project errors)
    ConfigError               (missing environment variable)
    ValidationError           (invalid UUID, malformed JSON)
    ApiError                  (HTTP error, timeout, network failure)
    DbError                   (PostgreSQL connection/query error)
```

### Error Flow by Command

```
Command Handler
  |
  +-- loadServerConfig() / loadDbConfig()
  |     throws ConfigError if env var missing
  |
  +-- validateUuid()
  |     throws ValidationError if format invalid
  |
  +-- apiRequest() / pool.query()
  |     throws ApiError or DbError on failure
  |
  v
cli.ts parseAsync().catch()
  |
  +-- LgToolError -> console.error(message), exit(1)
  +-- Unknown error -> console.error(stack), exit(2)
```

### HTTP Error Handling Details

| Scenario | Error Type | Message Format |
|----------|-----------|---------------|
| Non-2xx response | `ApiError` | `API error {status} from {url}: {body}` |
| Timeout (AbortController) | `ApiError` | `Request timed out after {ms}ms` |
| Network failure (ECONNREFUSED) | `ApiError` | `Network error: {message}` |
| DNS resolution failure | `ApiError` | `Network error: getaddrinfo ENOTFOUND {host}` |

### DB Error Handling Details

| Scenario | Error Type | Message Format |
|----------|-----------|---------------|
| Connection refused | `DbError` | `Database error: connect ECONNREFUSED (connection: postgresql://user:***@host:5432/db)` |
| Authentication failed | `DbError` | `Database error: password authentication failed (connection: postgresql://user:***@host:5432/db)` |
| Table does not exist | Warning on stderr | `Warning: Failed to query {table}: relation "{table}" does not exist` |
| SSL error | `DbError` | `Database error: {ssl message} (connection: ***masked***)` |

**Key security rule**: Connection strings are ALWAYS passed through `maskConnectionString()` before appearing in any error message. The password is replaced with `***`.

---

## 5. Data Flow Diagrams

### API Commands (agents, thread-create, run)

```
User CLI Input
      |
      v
  commander parses arguments
      |
      v
  loadServerConfig()  ----[missing]----> ConfigError -> exit(1)
      |
      v
  validateUuid()  --------[invalid]----> ValidationError -> exit(1)
      |
      v
  apiRequest<T>()
      |
      +-- Build URL: serverUrl + path
      +-- Create AbortController with timeout
      +-- Call native fetch()
      +-- Check response.ok
      |     +-- false: read body, throw ApiError
      |     +-- true: parse JSON as T
      +-- On AbortError: throw ApiError (timeout)
      +-- On TypeError: throw ApiError (network)
      |
      v
  formatOutput()
      |
      v
  console.log() -> stdout
```

### Extract Command

```
User CLI Input
      |
      v
  commander parses arguments
      |
      v
  loadDbConfig()  --------[missing]----> ConfigError -> exit(1)
      |
      v
  validateUuid()  --------[invalid]----> ValidationError -> exit(1)
      |
      v
  createPool(postgresUrl)
      |
      +-- Parse SSL from connection string
      +-- Configure pool (max: 6)
      |
      v
  extractThreadData(pool, threadId, includeBlobs)
      |
      +-- Promise.all([
      |     queryThread(pool, threadId),
      |     queryRuns(pool, threadId),
      |     queryCheckpoints(pool, threadId),
      |     queryCheckpointBlobs(pool, threadId, includeBlobs),
      |     queryCheckpointWrites(pool, threadId, includeBlobs),
      |     queryStore(pool, threadId),
      |   ])
      +-- Each query wrapped in safeQuery() for graceful failure
      +-- Convert Buffer values to base64
      |
      v
  Build ThreadExtraction object
      |
      v
  JSON.stringify(extraction, null, 2)
      |
      +-- --output flag: write to file
      +-- no flag: print to stdout
      |
      v
  pool.end()  (always, in finally block)
```

### Documents Command

Follows the same shape as the Extract Command, with two differences:
- A single query (`queryRetrievedDocuments`) instead of `Promise.all` over six tables. The query selects from `checkpoint_writes` where `channel = 'retrieved_docs'`, decodes the base64 blob, and runs a regex over `<document title='…' original_title='…' link='…'>…</document>` blocks to produce `RetrievedDocument[]`.
- Output formatting differs: with `--output` the command writes the same wrapped JSON shape (`{ thread_id, extracted_at, document_count, documents[] }`); without `--output` it prints a numbered, human-readable list (title, link, original_title, content preview).

---

## 6. CLI Command Design

### Commander Program Structure

```
lg-tool
  |
  +-- agents                                    (no options)
  |
  +-- thread-create
  |     --metadata <json>                       (optional, JSON string)
  |
  +-- run
  |     --thread <id>                           (required, UUID)
  |     --assistant <id>                        (required, UUID or graph_id)
  |     --message <text>                        (required, text string)
  |
  +-- extract
  |     --thread <id>                           (required, UUID)
  |     --output <file>                         (optional, file path)
  |     --include-blobs                         (optional, boolean flag)
  |
  +-- documents
        --thread <id>                           (required, UUID)
        --output <file>                         (optional, file path)
```

### Output Formats

| Command | Format | Destination |
|---------|--------|------------|
| `agents` | Formatted table (fixed-width columns) | stdout |
| `thread-create` | Key-value text | stdout |
| `run` | Key-value text + agent message content | stdout |
| `extract` | Pretty-printed JSON (`JSON.stringify(data, null, 2)`) | stdout or `--output` file |
| `documents` | Numbered human-readable list (stdout) **or** pretty JSON (`{ thread_id, extracted_at, document_count, documents[] }`) | stdout or `--output` file |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Known error (ConfigError, ValidationError, ApiError, DbError) |
| 2 | Unexpected/unknown error |

---

## 7. Database Schema (LangGraph tables, read-only access)

The `extract` command reads from all six tables below. The `documents` command (FR-5)
reuses the **`checkpoint_writes`** table — it filters rows where `channel = 'retrieved_docs'`
and parses the base64-decoded `blob` column for `<document>` blocks (see Section 2.7
`queryRetrievedDocuments`). No additional tables are introduced for FR-5.

### Thread Table

```sql
CREATE TABLE thread (
  thread_id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  metadata JSONB,
  status TEXT,           -- 'idle', 'busy', 'interrupted', 'error'
  config JSONB,
  values JSONB,
  interrupts JSONB,
  error BYTEA,           -- binary error data
  state_updated_at TIMESTAMPTZ
);
```

### Run Table

```sql
CREATE TABLE run (
  run_id UUID PRIMARY KEY,
  thread_id UUID REFERENCES thread(thread_id),
  assistant_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  metadata JSONB,
  status TEXT,
  kwargs JSONB,
  multitask_strategy TEXT
);
```

### Checkpoints Table

```sql
CREATE TABLE checkpoints (
  thread_id UUID,
  checkpoint_id UUID,
  run_id UUID,
  parent_checkpoint_id UUID,
  checkpoint JSONB,
  metadata JSONB,
  checkpoint_ns TEXT,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);
```

### Checkpoint Blobs Table

```sql
CREATE TABLE checkpoint_blobs (
  thread_id UUID,
  channel TEXT,
  version TEXT,
  type TEXT,
  blob BYTEA,             -- binary data, potentially large
  checkpoint_ns TEXT
);
```

### Checkpoint Writes Table

```sql
CREATE TABLE checkpoint_writes (
  thread_id UUID,
  checkpoint_id UUID,
  task_id TEXT,
  idx INTEGER,
  channel TEXT,
  type TEXT,
  blob BYTEA,             -- binary data
  checkpoint_ns TEXT
);
```

### Store Table

```sql
CREATE TABLE store (
  prefix TEXT,
  -- Additional columns vary by LangGraph version
  -- Queried with: prefix LIKE '{thread_id}%'
);
```

---

## 8. Package Configuration

### package.json

```json
{
  "name": "lg-tool",
  "version": "1.0.0",
  "description": "CLI tool for interacting with LangGraph servers and inspecting their PostgreSQL data",
  "type": "module",
  "main": "dist/cli.js",
  "bin": {
    "lg-tool": "dist/cli.js"
  },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test:e2e": "tsx test_scripts/test-e2e.ts",
    "test:config": "tsx test_scripts/test-config.ts",
    "test:utils": "tsx test_scripts/test-utils.ts",
    "test:documents": "tsx test_scripts/test-documents.ts"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "pg": "^8.13.0",
    "commander": "^12.0.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.19.0",
    "@types/pg": "^8.11.0",
    "@types/node": "^22.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

---

## 9. Test Design

All tests reside in `test_scripts/` per project convention.

### test_scripts/test-config.ts

Tests the configuration module in isolation (5 `test()` cases):

| Test | Input | Expected Outcome |
|------|-------|-----------------|
| Missing LANGGRAPH_SERVER_URL | unset env var | Throws ConfigError with specific message |
| Missing LANGGRAPH_POSTGRES_URL | unset env var | Throws ConfigError with specific message |
| loadServerConfig does not require DB config | only SERVER_URL set | Returns ServerConfig successfully |
| loadDbConfig does not require server config | only POSTGRES_URL set | Returns DbConfig successfully |
| Trailing slash stripped | URL with trailing / | serverUrl has no trailing slash |

### test_scripts/test-utils.ts

Tests utility and formatting functions (8 `test()` cases):

| Test | Input | Expected Outcome |
|------|-------|-----------------|
| Valid UUID accepted | `"550e8400-e29b-41d4-a716-446655440000"` | Returns the UUID |
| Invalid UUID rejected | `"not-a-uuid"` | Throws ValidationError |
| Empty string rejected | `""` | Throws ValidationError |
| maskConnectionString masks password | `"postgresql://user:secret@host/db"` | `"postgresql://user:***@host/db"` |
| maskConnectionString handles no password | `"postgresql://host/db"` | No crash, returns URL |
| maskConnectionString handles invalid URL | `"not-a-url"` | Returns `"***masked***"` |
| formatAgentsTable with data | Array of Assistants | Formatted table string |
| formatAgentsTable empty | Empty array | `"No assistants found."` |

### test_scripts/test-documents.ts

Unit tests for the `documents` command (no live DB required). 2 `test()` cases:

| Test | Input | Expected Outcome |
|------|-------|-----------------|
| Missing LANGGRAPH_POSTGRES_URL throws ConfigError | `LANGGRAPH_POSTGRES_URL=''` (empty, so dotenv won't repopulate from `.env`) | `documentsCommand` throws `ConfigError` with `variableName === 'LANGGRAPH_POSTGRES_URL'` |
| Invalid `--thread` UUID throws ValidationError before any DB call | `--thread = "not-a-uuid"`, valid POSTGRES_URL set | `documentsCommand` throws `ValidationError` with `field === '--thread'` |

A live-DB integration test for the documents command is intentionally out of scope here — it would require a thread that actually exercised a RAG pipeline with `retrieved_docs` channel writes. See AC-5 in `docs/reference/refined-request-lg-tool.md` for that case.

### test_scripts/test-e2e.ts

End-to-end test against a live LangGraph server and its PostgreSQL backing store. Requires three env vars: `LANGGRAPH_SERVER_URL`, `LANGGRAPH_POSTGRES_URL`, and `LANGGRAPH_TEST_ASSISTANT_ID` (UUID of an assistant known to be deployed on the server). Total: 11 `assert()` calls.

1. **List agents**: Verify at least 1 assistant returned; verify the assistant whose UUID matches `LANGGRAPH_TEST_ASSISTANT_ID` is present
2. **Create thread**: Verify returned thread_id is valid UUID; verify status is `"idle"`
3. **Send request**: Send `"Hello"` to the configured assistant; verify response has a `messages` array; capture run_id (informational only)
4. **Extract data**: Extract thread data from PostgreSQL; verify:
   - `thread` is not null and `thread_id` matches
   - `runs` has at least one record
   - `checkpoints` has at least one record
5. **File output**: Write to temp file, verify valid JSON
6. **Include blobs**: Re-extract with `--include-blobs`, verify `blob_base64` fields present (skipped if no `checkpoint_blobs` rows exist for the thread)

---

## 10. Security Considerations

1. **Credential masking**: `maskConnectionString()` is used in ALL error paths that might include a connection URL. The password is replaced with `***`.
2. **Parameterized queries**: All 9 SQL constants in `src/db-client.ts` use `$1` parameter syntax — zero string interpolation in SQL. (The 9 are: `SQL_THREAD`, `SQL_RUNS`, `SQL_CHECKPOINTS`, `SQL_CHECKPOINT_BLOBS_META`, `SQL_CHECKPOINT_BLOBS_FULL`, `SQL_CHECKPOINT_WRITES_META`, `SQL_CHECKPOINT_WRITES_FULL`, `SQL_STORE`, `SQL_RETRIEVED_DOCS`.)
3. **No credential logging**: The tool never logs, prints, or includes credentials in stdout output. Connection strings appear only in `.env` files (which are `.gitignored`).
4. **SSL**: Azure PostgreSQL connections use `ssl: { rejectUnauthorized: false }` because Azure uses Microsoft-managed certificates. This is documented for environments requiring strict certificate validation.

---

## References

- [Refined Specification](../reference/refined-request-lg-tool.md)
- [Technical Investigation](../reference/investigation-lg-tool.md)
- [Implementation Plan](plan-001-lg-tool-implementation.md)
- [Functional Requirements](project-functions.md)
