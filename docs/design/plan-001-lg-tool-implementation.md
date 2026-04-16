# Plan 001 - lg-tool Implementation

## Overview

This plan breaks the lg-tool CLI tool into six sequential phases with clearly defined deliverables, dependencies, and verification steps. The tool is a TypeScript CLI that interacts with a LangGraph server via REST API and queries its backing PostgreSQL database.

**Architecture**: Modular multi-file (Approach B from investigation document)  
**HTTP**: Native `fetch` (Node 18+)  
**Database**: `pg` (node-postgres)  
**CLI**: `commander`  
**Config**: `dotenv`, no defaults/fallbacks

---

## Phase 1: Project Scaffolding

**Objective**: Set up the project skeleton with all configuration files, directory structure, and dependencies installed.

**Dependencies**: None (first phase)

**Parallel**: No (foundation for all other phases)

### Files to Create

| File | Purpose |
|------|---------|
| `package.json` | Project metadata, scripts, dependencies, `"engines": { "node": ">=18" }` |
| `tsconfig.json` | TypeScript config (ES2022, NodeNext, strict) |
| `src/cli.ts` | Entry point stub with commander setup and version |
| `src/types.ts` | Shared TypeScript interfaces (Config, Assistant, Thread, Run, ExtractResult) |
| `.gitignore` | node_modules, dist, .env, *.js in src |

### Dependencies to Install

**Runtime**: `pg`, `commander`, `dotenv`  
**Dev**: `typescript`, `tsx`, `@types/pg`, `@types/node`

### Acceptance Criteria

- [ ] `npm install` completes without errors
- [ ] `npx tsx src/cli.ts --version` prints the version number
- [ ] `npx tsx src/cli.ts --help` prints the help text with all five subcommands listed (`agents`, `thread-create`, `run`, `extract`, `documents`)
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Directory structure matches the modular layout from the investigation document

### Verification Steps

```bash
cd lg-tool
npm install
npx tsx src/cli.ts --version
npx tsx src/cli.ts --help
npx tsc --noEmit
```

---

## Phase 2: Configuration Module

**Objective**: Implement environment variable loading with strict validation (no defaults, no fallbacks). Support `.env` files in CWD and `~/.lg-tool/.env`, with env vars taking precedence.

**Dependencies**: Phase 1 (needs package.json, tsconfig, types)

**Parallel**: Can be developed in parallel with Phase 3 types definition, but must be complete before Phase 4

### Files to Create

| File | Purpose |
|------|---------|
| `src/config.ts` | `loadServerConfig()` and `loadDbConfig()` functions |

### Files to Modify

| File | Change |
|------|--------|
| `src/types.ts` | Add `ServerConfig` and `DbConfig` interfaces |

### Design Decisions

- Two separate config loaders: `loadServerConfig()` returns `{ serverUrl: string }`, `loadDbConfig()` returns `{ postgresUrl: string }`
- Lazy loading: each command calls only the config it needs (API commands need `serverUrl`, extract needs `postgresUrl`)
- `.env` loading order: CWD `.env` first, then `~/.lg-tool/.env`
- Environment variables override `.env` values (this is the default `dotenv` behavior since it does not overwrite existing env vars)
- Missing required variables throw immediately with descriptive messages

### Acceptance Criteria

- [ ] Calling `loadServerConfig()` without `LANGGRAPH_SERVER_URL` set throws `"LANGGRAPH_SERVER_URL environment variable is required"`
- [ ] Calling `loadDbConfig()` without `LANGGRAPH_POSTGRES_URL` set throws `"LANGGRAPH_POSTGRES_URL environment variable is required"`
- [ ] When both env var and `.env` file define `LANGGRAPH_SERVER_URL`, the env var value wins
- [ ] `loadServerConfig()` does NOT require `LANGGRAPH_POSTGRES_URL` to be set
- [ ] `loadDbConfig()` does NOT require `LANGGRAPH_SERVER_URL` to be set
- [ ] No default or fallback values are used anywhere

### Verification Steps

```bash
# Should fail with clear error
unset LANGGRAPH_SERVER_URL LANGGRAPH_POSTGRES_URL
npx tsx -e "import { loadServerConfig } from './src/config.js'; loadServerConfig();"
# Expected: Error: LANGGRAPH_SERVER_URL environment variable is required

# Should succeed
LANGGRAPH_SERVER_URL=http://localhost:8000 npx tsx -e "import { loadServerConfig } from './src/config.js'; console.log(loadServerConfig());"
# Expected: { serverUrl: 'http://localhost:8000' }
```

---

## Phase 3: LangGraph API Client

**Objective**: Implement the HTTP client wrapper for LangGraph REST API calls. Includes generic request function with timeout support, error handling, and credential masking.

**Dependencies**: Phase 1 (types), Phase 2 (config interfaces)

**Parallel**: Can be developed in parallel with Phase 5 (DB client) once Phase 2 is complete

### Files to Create

| File | Purpose |
|------|---------|
| `src/api-client.ts` | `apiRequest<T>()` generic function, `searchAssistants()`, `createThread()`, `runAndWait()` |
| `src/formatters.ts` | `formatAgentsTable()`, `formatThreadResult()`, `formatRunResult()`, `maskConnectionString()` |
| `src/utils.ts` | `validateUuid()`, UUID regex constant |

### Files to Modify

| File | Change |
|------|--------|
| `src/types.ts` | Add `Assistant`, `Thread`, `RunResult`, `ApiRequestOptions` interfaces |

### Design Decisions

- Generic `apiRequest<T>()` function with `AbortController` timeout
- Default timeout: 30 seconds for most endpoints
- `/runs/wait` timeout: 300 seconds (5 minutes) to match SDK defaults and account for Azure proxy timeouts
- All HTTP errors produce messages with status code and response body
- Connection string masking via URL parsing with password replacement

### Key Functions

```
apiRequest<T>(serverUrl, path, options) -> Promise<T>
searchAssistants(serverUrl) -> Promise<Assistant[]>
createThread(serverUrl, metadata?) -> Promise<Thread>
runAndWait(serverUrl, threadId, assistantId, message) -> Promise<RunResult>
validateUuid(value, name) -> string (throws on invalid)
maskConnectionString(url) -> string
formatAgentsTable(assistants) -> string
```

### Acceptance Criteria

- [ ] `searchAssistants()` correctly calls `POST /assistants/search` with `{"limit": 100}`
- [ ] `createThread()` correctly calls `POST /threads` with optional metadata
- [ ] `runAndWait()` correctly calls `POST /threads/{id}/runs/wait` with the message payload
- [ ] HTTP errors include status code and response body in the error message
- [ ] Timeout is enforced via AbortController (30s default, 300s for runs/wait)
- [ ] `validateUuid()` accepts valid UUIDs and rejects invalid ones
- [ ] `maskConnectionString()` replaces password with `***`

### Verification Steps

```bash
# With valid server URL
LANGGRAPH_SERVER_URL="https://<langgraph-server-host>" \
  npx tsx -e "
    import { searchAssistants } from './src/api-client.js';
    const result = await searchAssistants('$LANGGRAPH_SERVER_URL');
    console.log(JSON.stringify(result, null, 2));
  "
```

---

## Phase 4: CLI Commands

**Objective**: Wire up all five CLI commands (`agents`, `thread-create`, `run`, `extract`, `documents`) using commander, connecting them to the API client and DB client modules.

**Dependencies**: Phase 2 (config), Phase 3 (API client). The `extract` command also depends on Phase 5 (DB client).

**Parallel**: The three API commands (`agents`, `thread-create`, `run`) can be implemented as soon as Phase 3 is complete, without waiting for Phase 5. The `extract` command requires Phase 5.

### Files to Create

| File | Purpose |
|------|---------|
| `src/commands/agents.ts` | `agents` command handler |
| `src/commands/thread-create.ts` | `thread-create` command handler |
| `src/commands/run.ts` | `run` command handler |
| `src/commands/extract.ts` | `extract` command handler (depends on Phase 5) |
| `src/commands/documents.ts` | `documents` command handler (depends on Phase 5) |

### Files to Modify

| File | Change |
|------|--------|
| `src/cli.ts` | Import and register all five command handlers with commander |

### Command Details

#### `agents` command
- Calls `loadServerConfig()`
- Calls `searchAssistants(config.serverUrl)`
- Formats and prints table via `formatAgentsTable()`
- Handles empty results with informational message

#### `thread-create` command
- Calls `loadServerConfig()`
- Parses `--metadata` JSON if provided (with try/catch for invalid JSON)
- Calls `createThread(config.serverUrl, metadata)`
- Prints thread_id, status, created_at, metadata

#### `run` command
- Calls `loadServerConfig()`
- Validates `--thread` UUID via `validateUuid()`
- Calls `runAndWait(config.serverUrl, threadId, assistantId, message)`
- Prints "Waiting for agent response..." before the call
- Prints agent response messages, run_id, and status

#### `extract` command
- Calls `loadDbConfig()`
- Validates `--thread` UUID via `validateUuid()`
- Calls `extractThreadData(pool, threadId, includeBlobs)`
- Pretty-prints JSON to stdout or writes to `--output` file
- Properly closes the DB pool after extraction

#### `documents` command
- Calls `loadDbConfig()`
- Validates `--thread` UUID via `validateUuid()`
- Calls `queryRetrievedDocuments(pool, threadId)` from `db-client.ts`
- Wraps the result with `thread_id`, `extracted_at`, `document_count`
- Writes pretty JSON to `--output` file or prints a numbered, human-readable list to stdout
- Properly closes the DB pool after extraction; wraps errors in `DbError` with masked connection string

### Acceptance Criteria

- [ ] `lg-tool agents` displays formatted table of assistants
- [ ] `lg-tool thread-create` creates a thread and displays its details
- [ ] `lg-tool thread-create --metadata '{"key":"value"}'` creates a thread with metadata
- [ ] `lg-tool run --thread <id> --assistant <id> --message "Hello"` returns agent response
- [ ] `lg-tool extract --thread <id>` returns JSON with all table data
- [ ] `lg-tool extract --thread <id> --output result.json` writes to file
- [ ] `lg-tool extract --thread <id> --include-blobs` includes base64 blob data
- [ ] `lg-tool documents --thread <id>` lists retrieved documents (or an info message if none)
- [ ] `lg-tool documents --thread <id> --output docs.json` writes JSON to file
- [ ] All commands fail clearly when required env vars are missing
- [ ] All commands fail clearly when required flags are missing (commander enforces this)
- [ ] Invalid UUID arguments produce clear error messages before any network/DB calls

### Verification Steps

```bash
# Test each command individually
npx tsx src/cli.ts agents
npx tsx src/cli.ts thread-create
npx tsx src/cli.ts thread-create --metadata '{"purpose":"test"}'
npx tsx src/cli.ts run --thread <id> --assistant <assistant-uuid> --message "Hello"
npx tsx src/cli.ts extract --thread <id>
npx tsx src/cli.ts extract --thread <id> --output /tmp/extract-test.json
npx tsx src/cli.ts extract --thread <id> --include-blobs
npx tsx src/cli.ts documents --thread <id>
npx tsx src/cli.ts documents --thread <id> --output /tmp/docs-test.json
```

---

## Phase 5: PostgreSQL Data Extraction Module

**Objective**: Implement the database client for querying all LangGraph-related tables for a given thread ID.

**Dependencies**: Phase 1 (types), Phase 2 (config)

**Parallel**: Can be developed in parallel with Phase 3 (API client) and Phase 4 API commands

### Files to Create

| File | Purpose |
|------|---------|
| `src/db-client.ts` | `createPool()`, `extractThreadData()`, individual query functions |

### Files to Modify

| File | Change |
|------|--------|
| `src/types.ts` | Add `ExtractResult`, `ThreadRecord`, `RunRecord`, `CheckpointRecord`, etc. |

### Design Decisions

- Connection pool with `max: 6` (one per concurrent query)
- SSL configuration: parse `sslmode=require` from connection string, use `{ rejectUnauthorized: false }` for Azure
- All 6 queries run concurrently via `Promise.all()`
- Parameterized queries only (`$1` parameters, never string interpolation)
- Blob handling: two query variants per blob table (metadata-only vs full blob with `encode(blob, 'base64')`)
- Graceful handling if a table does not exist (catch error, log warning, continue)
- Pool is properly closed after extraction

### Queries

| Table | Query | Notes |
|-------|-------|-------|
| `thread` | `SELECT * FROM thread WHERE thread_id = $1` | Single row |
| `run` | `SELECT * FROM run WHERE thread_id = $1 ORDER BY created_at ASC` | Multiple rows |
| `checkpoints` | `SELECT * FROM checkpoints WHERE thread_id = $1 ORDER BY checkpoint_id ASC` | Multiple rows |
| `checkpoint_blobs` | Metadata-only or full blob depending on `--include-blobs` | See investigation doc |
| `checkpoint_writes` | Metadata-only or full blob depending on `--include-blobs` | See investigation doc |
| `store` | `SELECT * FROM store WHERE prefix LIKE $1` with `${threadId}%` | May return empty |

### Acceptance Criteria

- [ ] `createPool()` correctly configures SSL when connection string contains `sslmode=require`
- [ ] All 6 queries execute concurrently via `Promise.all()`
- [ ] All queries use parameterized `$1` syntax (no string interpolation)
- [ ] Default mode excludes blob binary data, includes `blob_size`
- [ ] `--include-blobs` mode includes base64-encoded blob data via `encode(blob, 'base64')`
- [ ] Missing tables produce a warning but do not crash the extraction
- [ ] Connection pool is properly closed after extraction
- [ ] Connection errors produce clear messages with masked connection string

### Verification Steps

```bash
# Direct DB client test
LANGGRAPH_POSTGRES_URL="postgresql://..." npx tsx -e "
  import { Pool } from 'pg';
  import { extractThreadData } from './src/db-client.js';
  // ... test with a known thread_id
"
```

---

## Phase 6: Integration and End-to-End Testing

**Objective**: Create test scripts that verify the full flow works end-to-end against the validation server and database.

**Dependencies**: All previous phases (1-5)

**Parallel**: No (final phase)

### Files to Create

| File | Purpose |
|------|---------|
| `test_scripts/test-e2e.ts` | Full flow: list agents -> create thread -> run -> extract |
| `test_scripts/test-config.ts` | Config module validation tests |
| `test_scripts/test-utils.ts` | UUID validation and formatting tests |
| `.env.example` | Example env file showing required variables (no real credentials) |

### Test Script: test-e2e.ts

The end-to-end test performs (assertion counts reflect the current implementation):

1. **List agents**: Verify at least one assistant is returned; verify the assistant whose UUID is provided via the `LANGGRAPH_TEST_ASSISTANT_ID` env var is present (no hardcoded UUIDs)
2. **Create thread**: Verify thread_id is a valid UUID, status is "idle"
3. **Send request**: Send "Hello" to the configured assistant within the created thread, verify response contains a `messages` array; capture run_id (informational, not asserted)
4. **Extract data**: Extract all data for the thread, verify:
   - `thread` is not null and `thread_id` matches
   - `runs` contains at least one record
   - `checkpoints` contains at least one record
   (Assertions for `checkpoint_blobs`/`checkpoint_writes` row counts and run_id cross-checks are intentionally not made — they depend on agent state and would produce flaky tests against arbitrary deployments.)
5. **File output**: Test `--output` flag writes valid JSON to a file
6. **Blob inclusion**: Test `--include-blobs` flag includes `blob_base64` fields when checkpoint_blobs rows exist (skipped if none)

### Test Script: test-config.ts

- Test missing `LANGGRAPH_SERVER_URL` throws correct error
- Test missing `LANGGRAPH_POSTGRES_URL` throws correct error
- Test `loadServerConfig()` does not require DB config
- Test `loadDbConfig()` does not require server config
- Test `.env` file loading

### Test Script: test-utils.ts

- Test `validateUuid()` with valid UUIDs
- Test `validateUuid()` with invalid strings
- Test `maskConnectionString()` with various URL formats
- Test `formatAgentsTable()` with sample data

### Acceptance Criteria

- [ ] `test-e2e.ts` completes the full flow successfully against the validation server
- [ ] All extracted data is internally consistent (thread_id matches across tables, run_ids match)
- [ ] `test-config.ts` validates all config error scenarios
- [ ] `test-utils.ts` validates utility functions
- [ ] All tests produce clear pass/fail output

### Verification Steps

```bash
# Run all test scripts. Real values for the env vars below must be supplied
# locally (e.g. via ~/.lg-tool/.env or shell exports) — never committed.
LANGGRAPH_SERVER_URL="https://<langgraph-server-host>" \
LANGGRAPH_POSTGRES_URL="postgresql://<db-user>:<redacted>@<db-host>:5432/<db-name>?sslmode=require" \
LANGGRAPH_TEST_ASSISTANT_ID="<assistant-uuid>" \
npx tsx test_scripts/test-e2e.ts

npx tsx test_scripts/test-config.ts
npx tsx test_scripts/test-utils.ts
```

---

## File Creation Summary

### Phase 1
- `package.json`
- `tsconfig.json`
- `src/cli.ts`
- `src/types.ts`
- `.gitignore`

### Phase 2
- `src/config.ts`

### Phase 3
- `src/api-client.ts`
- `src/formatters.ts`
- `src/utils.ts`

### Phase 4
- `src/commands/agents.ts`
- `src/commands/thread-create.ts`
- `src/commands/run.ts`
- `src/commands/extract.ts`
- `src/commands/documents.ts`

### Phase 5
- `src/db-client.ts`

### Phase 6
- `test_scripts/test-e2e.ts`
- `test_scripts/test-config.ts`
- `test_scripts/test-utils.ts`
- `.env.example`

**Total new files**: 17

---

## Dependency Graph

```
Phase 1 (Scaffolding)
  |
  +---> Phase 2 (Config)
  |       |
  |       +---> Phase 3 (API Client) ----+---> Phase 4a (agents, thread-create, run commands)
  |       |                               |
  |       +---> Phase 5 (DB Client) ------+---> Phase 4b (extract command)
  |                                               |
  |                                               v
  +---------------------------------------------> Phase 6 (E2E Testing)
```

**Parallelizable**:
- Phase 3 and Phase 5 can run in parallel (both depend only on Phase 2)
- Phase 4a (API commands) and Phase 5 can run in parallel
- Phase 4b (extract command) requires both Phase 3 and Phase 5

---

## Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | `/runs/wait` timeout behind Azure proxy (230s idle timeout) | Medium | High | Use 300s client timeout; print "Waiting..." message; document the limitation |
| R2 | PostgreSQL SSL certificate rejection on Azure | Medium | Medium | Use `rejectUnauthorized: false`; document for strict SSL environments |
| R3 | Very large blobs in checkpoint tables cause huge JSON output | Medium | Medium | Default to metadata-only; `--include-blobs` is opt-in |
| R4 | LangGraph DB schema differs from documented tables | Low | Medium | Graceful handling per table (catch missing table errors, continue) |
| R5 | Node.js version < 18 (no native fetch) | Low | High | Enforce `"engines": { "node": ">=18" }` in package.json |
| R6 | Validation server unavailable during development | Low | Medium | Implement and unit-test modules locally first; E2E tests last |
| R7 | `store` table not keyed by thread_id | Low | Low | Return empty array gracefully; document behavior |

---

## Estimated Effort

| Phase | Effort | Notes |
|-------|--------|-------|
| Phase 1: Scaffolding | Small | Config files and stubs |
| Phase 2: Config | Small | Two functions with validation |
| Phase 3: API Client | Medium | HTTP wrapper + formatters + utils |
| Phase 4: CLI Commands | Medium | Five command handlers + commander wiring |
| Phase 5: DB Client | Medium | Six concurrent queries + blob handling + SSL |
| Phase 6: Testing | Medium | Three test scripts covering all scenarios |

**Total**: One focused development cycle (single session or two sessions).
