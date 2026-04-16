# lg-tool - Technical Investigation

> **Snapshot disclaimer**: This document captures the technical investigation that
> preceded implementation. It describes a tool with **four** commands (`agents`,
> `thread-create`, `run`, `extract`). A fifth command, `documents` (FR-5), was
> added later and is **not** reflected anywhere in this file. For the current
> command set and architecture, see `docs/design/project-design.md` and
> `docs/design/project-functions.md`. References here to "four commands" /
> "four REST calls" / "four command handlers" should be read as
> "four-at-investigation-time", not as the current state.

## 1. Executive Summary

The lg-tool is a straightforward TypeScript CLI tool with four commands that interact with a LangGraph server via REST API and directly query its backing PostgreSQL database. After investigating the architecture options, API patterns, database access strategies, and CLI frameworks, the recommendation is:

**Use a modular multi-file architecture with raw HTTP calls (native `fetch`), the `pg` library for PostgreSQL access, and `commander` for CLI parsing.** The official `@langchain/langgraph-sdk` TypeScript package exists but adds unnecessary abstraction for our four simple REST calls. Raw `fetch` keeps the tool lightweight, transparent, and debuggable.

The project is low-risk and can be implemented in a single focused development cycle. No deep research is required on any topic.

---

## 2. Approach Options

### Approach A: Monolithic Single-File CLI

**Description**: All code in a single `src/cli.ts` file -- config loading, HTTP client, DB client, all four commands, and output formatting.

**Pros**:
- Simplest to start with; no import wiring
- Easy to read top-to-bottom for a small tool

**Cons**:
- Becomes unwieldy past ~400 lines (this tool will likely reach 500-700 lines)
- Hard to unit test individual components
- Mixing concerns (HTTP, DB, CLI parsing, formatting) in one file
- Harder to extend if new commands are added later

**Verdict**: Acceptable for a prototype but not recommended for a tool that will be maintained and extended.

### Approach B: Modular Multi-File Architecture (Recommended)

**Description**: Separate modules for config, API client, DB client, each CLI command, and output formatting.

```
src/
  cli.ts              # Entry point, commander setup
  config.ts           # Environment variable loading & validation
  api-client.ts       # LangGraph REST API wrapper (fetch-based)
  db-client.ts        # PostgreSQL query functions
  commands/
    agents.ts         # "agents" command handler
    thread-create.ts  # "thread-create" command handler
    run.ts            # "run" command handler
    extract.ts        # "extract" command handler
  formatters.ts       # Table and JSON output formatting
  types.ts            # Shared TypeScript interfaces
```

**Pros**:
- Clean separation of concerns
- Each module is independently testable
- Easy to add new commands or modify existing ones
- Follows established Node.js CLI project conventions
- Config validation is centralized and reusable

**Cons**:
- Slightly more initial setup (more files, more imports)
- Minor overhead for a tool with only four commands

**Verdict**: Recommended. The marginal setup cost is negligible and the maintainability benefits are significant.

### Approach C: Use `@langchain/langgraph-sdk` TypeScript SDK

**Description**: Instead of raw HTTP calls, use the official LangGraph TypeScript SDK (`@langchain/langgraph-sdk`) which provides `Client.assistants.search()`, `Client.threads.create()`, `Client.runs.wait()`, etc.

**Pros**:
- Typed responses out of the box
- Handles some edge cases (retry, timeout defaults)
- Maintained by LangChain team

**Cons**:
- Adds a heavy dependency chain (the SDK pulls in multiple LangChain packages)
- Abstracts away the HTTP layer, making debugging harder
- Our use case is 3 simple REST calls -- the SDK is overkill
- SDK version churn could introduce breaking changes
- Less transparent for the "investigator" purpose (we want to see exactly what we send/receive)

**Verdict**: Not recommended. The SDK provides value for complex agent orchestration, not for a simple CLI that makes 3 HTTP calls and runs SQL queries.

---

## 3. Recommended Approach

**Approach B: Modular Multi-File Architecture with Raw HTTP**

### Justification

1. **Simplicity**: The tool makes exactly 3 types of HTTP calls and 6 SQL queries. Raw `fetch` + `pg` is the right level of abstraction.
2. **Transparency**: As an "investigator" tool, seeing the exact requests and responses is a feature, not a bug.
3. **Minimal dependencies**: Only `pg`, `commander`, `dotenv`, plus TypeScript tooling. No framework bloat.
4. **Testability**: Modular structure allows unit testing config validation, formatters, and query builders independently from the live server.
5. **Extensibility**: New commands can be added as new files in `commands/` without touching existing code.

---

## 4. Key Technical Decisions

### 4.1 Architecture & Project Structure

**Decision**: Modular multi-file layout as described in Approach B.

**Config validation pattern**: A single `loadConfig()` function in `config.ts` that:
- Calls `dotenv.config()` to load `.env` files (CWD first, then `~/.lg-tool/.env`)
- Reads `LANGGRAPH_SERVER_URL` and `LANGGRAPH_POSTGRES_URL` from `process.env`
- Throws immediately with a descriptive error if any required variable is missing
- Returns a typed `Config` object
- Never provides defaults or fallbacks (per project conventions)

```typescript
interface Config {
  serverUrl: string;      // LANGGRAPH_SERVER_URL
  postgresUrl: string;    // LANGGRAPH_POSTGRES_URL
}

function loadConfig(): Config {
  // Load .env files
  dotenv.config({ path: path.join(process.cwd(), '.env') });
  dotenv.config({ path: path.join(os.homedir(), '.lg-tool', '.env') });

  const serverUrl = process.env.LANGGRAPH_SERVER_URL;
  if (!serverUrl) {
    throw new Error('LANGGRAPH_SERVER_URL environment variable is required');
  }

  const postgresUrl = process.env.LANGGRAPH_POSTGRES_URL;
  if (!postgresUrl) {
    throw new Error('LANGGRAPH_POSTGRES_URL environment variable is required');
  }

  return { serverUrl, postgresUrl };
}
```

**Lazy config loading**: Each command calls `loadConfig()` at the start, requesting only the variables it needs. The `agents`, `thread-create`, and `run` commands need only `serverUrl`. The `extract` command needs only `postgresUrl`. This avoids requiring both env vars when only one is needed.

**Refinement**: Split config into two functions:
- `loadServerConfig(): { serverUrl: string }` -- for API commands
- `loadDbConfig(): { postgresUrl: string }` -- for extract command

### 4.2 LangGraph API Interaction

**Decision**: Use Node.js native `fetch` (available in Node 18+) with no additional HTTP library.

**Key patterns**:

```typescript
async function apiRequest<T>(config: { serverUrl: string }, path: string, options: {
  method: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
}): Promise<T> {
  const url = `${config.serverUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);

  try {
    const response = await fetch(url, {
      method: options.method,
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }

    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}
```

**`/runs/wait` endpoint gotchas**:

1. **Long-polling behavior**: The server holds the HTTP connection open until the agent run completes. This can take 30 seconds to several minutes depending on the agent's complexity.
2. **Timeout layering**: There are three timeout layers to consider:
   - **Client-side HTTP timeout**: Must be set high (at least 120 seconds, preferably 300 seconds) via `AbortController`.
   - **Server-side timeout**: The LangGraph server itself has internal timeouts (configurable, defaults vary by deployment).
   - **Reverse proxy timeout**: If deployed behind Azure App Service (as in the validation URL), the proxy may have its own idle connection timeout (typically 230 seconds for Azure).
3. **No intermediate data**: Unlike `/runs/stream`, the `/wait` endpoint sends nothing until the run completes. If the connection drops, the client gets no partial results.
4. **Disconnect behavior**: Recent LangGraph versions support an `on_disconnect` field to control whether the server-side run continues if the client disconnects.
5. **Recommendation**: Use a 300-second (5-minute) timeout for the `/runs/wait` call. Display a "Waiting for agent response..." message so the user knows the tool is not hung.

**Why not the `@langchain/langgraph-sdk`**:
- The SDK (`@langchain/langgraph-sdk` on npm, ~42K weekly downloads) is well-maintained but designed for complex agent orchestration workflows.
- For our 3 simple API calls (`POST /assistants/search`, `POST /threads`, `POST /threads/{id}/runs/wait`), raw `fetch` is clearer and has zero dependency overhead.
- The SDK's default read timeout of 300 seconds is a useful data point -- we should match it.

### 4.3 PostgreSQL Data Extraction

**Decision**: Use `pg` (node-postgres) with parameterized queries and concurrent execution.

**Connection pattern**:

```typescript
import { Pool } from 'pg';

function createPool(postgresUrl: string): Pool {
  return new Pool({
    connectionString: postgresUrl,
    max: 6,  // One connection per concurrent query
    ssl: postgresUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });
}
```

**Parameterized queries** (all queries use `$1` parameters, never string interpolation):

```typescript
const threadQuery = 'SELECT * FROM thread WHERE thread_id = $1';
const runQuery = 'SELECT * FROM run WHERE thread_id = $1 ORDER BY created_at ASC';
// etc.
```

**Bytea / binary column handling**:

- The `pg` library returns `bytea` columns as Node.js `Buffer` objects.
- For the default case (no `--include-blobs`), use SQL-side `length(blob)` to get size without transferring binary data:
  ```sql
  SELECT thread_id, channel, version, type, length(blob) as blob_size, checkpoint_ns
  FROM checkpoint_blobs WHERE thread_id = $1
  ```
- When `--include-blobs` is specified, select the full blob column and convert to base64 in JavaScript:
  ```typescript
  // After query, for each row:
  if (row.blob instanceof Buffer) {
    row.blob = row.blob.toString('base64');
  }
  ```
- Alternatively, use PostgreSQL's `encode(blob, 'base64')` in the SQL query to have the database return base64 text directly. This avoids transferring raw binary over the wire and then re-encoding. **Recommended approach**: Use `encode(blob, 'base64') as blob_base64` in the SQL query when `--include-blobs` is active.

**Concurrent query execution**:

```typescript
async function extractThreadData(pool: Pool, threadId: string, includeBlobs: boolean) {
  const [thread, runs, checkpoints, checkpointBlobs, checkpointWrites, store] = await Promise.all([
    pool.query('SELECT * FROM thread WHERE thread_id = $1', [threadId]),
    pool.query('SELECT * FROM run WHERE thread_id = $1 ORDER BY created_at ASC', [threadId]),
    pool.query('SELECT * FROM checkpoints WHERE thread_id = $1 ORDER BY checkpoint_id ASC', [threadId]),
    pool.query(includeBlobs
      ? 'SELECT *, encode(blob, \'base64\') as blob_base64 FROM checkpoint_blobs WHERE thread_id = $1'
      : 'SELECT thread_id, channel, version, type, length(blob) as blob_size, checkpoint_ns FROM checkpoint_blobs WHERE thread_id = $1',
      [threadId]),
    pool.query(includeBlobs
      ? 'SELECT *, encode(blob, \'base64\') as blob_base64 FROM checkpoint_writes WHERE thread_id = $1 ORDER BY checkpoint_id, idx'
      : 'SELECT thread_id, checkpoint_id, task_id, idx, channel, type, length(blob) as blob_size, checkpoint_ns FROM checkpoint_writes WHERE thread_id = $1 ORDER BY checkpoint_id, idx',
      [threadId]),
    pool.query('SELECT * FROM store WHERE prefix LIKE $1', [`${threadId}%`]),
  ]);

  return {
    thread_id: threadId,
    extracted_at: new Date().toISOString(),
    thread: thread.rows[0] ?? null,
    runs: runs.rows,
    checkpoints: checkpoints.rows,
    checkpoint_blobs: checkpointBlobs.rows,
    checkpoint_writes: checkpointWrites.rows,
    store: store.rows,
  };
}
```

**SSL handling**: The validation connection string includes `sslmode=require`. The `pg` library needs explicit SSL configuration. Set `ssl: { rejectUnauthorized: false }` for Azure PostgreSQL (which uses Microsoft-managed certificates that may not be in the default trust store).

**UUID validation**: Validate thread_id format before querying to provide clear error messages:

```typescript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateUuid(value: string, name: string): string {
  if (!UUID_REGEX.test(value)) {
    throw new Error(`Invalid UUID for ${name}: "${value}"`);
  }
  return value;
}
```

### 4.4 CLI Framework (commander.js)

**Decision**: Use `commander` with subcommands.

**Pattern**:

```typescript
import { Command } from 'commander';

const program = new Command();

program
  .name('lg-tool')
  .description('CLI tool for interacting with LangGraph servers and inspecting their PostgreSQL data')
  .version('1.0.0');

program
  .command('agents')
  .description('List all available agents/assistants')
  .action(agentsCommand);

program
  .command('thread-create')
  .description('Create a new thread')
  .option('--metadata <json>', 'JSON metadata to attach to the thread')
  .action(threadCreateCommand);

program
  .command('run')
  .description('Send a request to an agent')
  .requiredOption('--thread <id>', 'Thread ID (UUID)')
  .requiredOption('--assistant <id>', 'Assistant ID (UUID or graph_id)')
  .requiredOption('--message <text>', 'Message to send to the agent')
  .action(runCommand);

program
  .command('extract')
  .description('Extract all thread data from PostgreSQL')
  .requiredOption('--thread <id>', 'Thread ID (UUID)')
  .option('--output <file>', 'Output file path for JSON')
  .option('--include-blobs', 'Include base64-encoded blob data')
  .action(extractCommand);

program.parse();
```

**Key decisions**:
- Use `requiredOption()` for mandatory flags -- commander will auto-error if missing.
- Parse `--metadata` as JSON inside the command handler with try/catch for invalid JSON.
- The `--assistant` flag accepts either a UUID or a graph_id string (the API supports both).
- Output formatting: Use `console.table()` for the agents list (simple and built-in), `JSON.stringify(data, null, 2)` for extract output.

### 4.5 Output Formatting

**Table output** (agents command): Use a simple manual formatter or `console.table()`. Since `console.table()` can be wide, a custom column-aligned formatter may be better for terminal readability:

```typescript
function formatAgentsTable(assistants: Assistant[]): string {
  const headers = ['assistant_id', 'graph_id', 'name', 'version', 'created_at'];
  // Calculate column widths, pad, return formatted string
}
```

**JSON output** (extract command): `JSON.stringify(data, null, 2)` with a custom replacer to handle Buffer-to-base64 conversion and BigInt serialization if needed.

### 4.6 Error Handling & Security

**Connection string masking**: Never log or display the full PostgreSQL URL. Mask credentials in error output:

```typescript
function maskConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '***masked***';
  }
}
```

**Error hierarchy**:
- Config errors: Throw immediately with specific message ("LANGGRAPH_SERVER_URL environment variable is required")
- Validation errors: Throw before any network call ("Invalid UUID for --thread: ...")
- Network errors: Catch and wrap with context ("Failed to connect to LangGraph server at ...: ECONNREFUSED")
- API errors: Include HTTP status and response body
- DB errors: Include error code but mask connection string

---

## 5. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `/runs/wait` timeout behind Azure proxy | Medium | High -- user gets a cryptic 502/504 error | Use 300s client timeout; document that Azure App Service has a 230s idle timeout; suggest `/runs/stream` as future enhancement if this is a persistent problem |
| PostgreSQL SSL certificate rejection | Medium | Medium -- tool cannot connect to DB | Use `rejectUnauthorized: false` for Azure PostgreSQL; document this and provide guidance for strict SSL if needed |
| `store` table query returns no results | Low | Low -- empty array is valid | Document that store entries may not be keyed by thread_id; return empty array gracefully |
| `bytea` columns contain very large blobs | Medium | Medium -- JSON output becomes huge | Default to metadata-only (size + type); `--include-blobs` is opt-in; consider adding a `--max-blob-size` flag if needed |
| LangGraph server API changes between versions | Low | Medium -- requests may fail | Pin against the known API version (v0.7.89); add API version header if supported; document the target version |
| Database schema changes in future LangGraph versions | Low | Medium -- SQL queries may break | Document the known schema; add graceful handling if a table does not exist (catch the error, report it, continue with other tables) |
| Node.js version < 18 (no native fetch) | Low | High -- tool won't work | Specify `"engines": { "node": ">=18" }` in package.json; check at startup |

---

## 6. Technical Research Guidance

**Research needed: No**

All technical questions have been sufficiently answered by this investigation:

- **LangGraph REST API**: Standard HTTP endpoints, well-documented. The three endpoints we need (`/assistants/search`, `/threads`, `/threads/{id}/runs/wait`) are stable and straightforward.
- **`@langchain/langgraph-sdk`**: Exists and is mature (~42K weekly npm downloads), but is overkill for our use case. Raw `fetch` is the right choice.
- **`/runs/wait` behavior**: Long-polling with no intermediate data. Default SDK timeout is 300 seconds. We should match this.
- **PostgreSQL bytea handling**: `pg` returns Buffers; use `Buffer.toString('base64')` or SQL-side `encode(blob, 'base64')`. Both approaches are well-established.
- **`commander` patterns**: Subcommand structure with `requiredOption()` and `.option()` is the standard approach. No gotchas.
- **`pg` parameterized queries**: Standard `$1, $2` syntax with `pool.query(sql, [params])`. No surprises.
- **Concurrent queries**: `Promise.all()` with a connection pool (max 6) is the standard pattern.

No topic requires deeper investigation. The tool can proceed directly to implementation planning.

---

## Appendix: Package Dependencies

```json
{
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

## Appendix: TypeScript Configuration

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
