# LangGraph Investigator - Refined Specification

## Title
**LangGraph Investigator** - A TypeScript CLI tool for interacting with LangGraph servers and inspecting their underlying PostgreSQL data.

## Summary
LangGraph Investigator is a TypeScript CLI tool that provides four core operations against a LangGraph deployment: (1) listing available agents/assistants, (2) creating new threads, (3) sending requests to a specific agent within a thread, and (4) directly querying the PostgreSQL database backing the LangGraph server to extract all data related to a specific thread, including thread records, runs, checkpoints, checkpoint blobs, checkpoint writes, and store entries. The tool enables developers to both interact with LangGraph agents and deeply inspect the internal data structures that LangGraph creates, facilitating debugging, testing, and understanding of agent execution flows.

---

## Objectives

1. **List Agents**: Query a LangGraph server and display all available assistants/agents with their metadata (ID, graph_id, name, description, version, timestamps).
2. **Create Thread**: Create a new thread on the LangGraph server and return the thread ID and metadata.
3. **Send Request**: Submit a user message to a specific agent within the context of a specific thread, wait for the response, and display the agent's output.
4. **Extract Thread Data**: Connect directly to the PostgreSQL database used by LangGraph and extract all data related to a specific thread, covering the following tables: `thread`, `run`, `checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, and `store`.

---

## Functional Requirements

### FR-1: List Available Agents

**Command**: `langgraph-investigator agents`

**Behavior**:
- Send a `POST /assistants/search` request to the LangGraph server with `{"limit": 100}`.
- Parse the response array of `Assistant` objects.
- Display results in a formatted table showing: `assistant_id`, `graph_id`, `name`, `description`, `version`, `created_at`, `updated_at`.
- If no assistants are found, display an informational message.

**Input**: None (uses configured server URL).

**Output**: Formatted table of assistants.

**API Details**:
- Endpoint: `POST {server_url}/assistants/search`
- Request body: `{ "limit": 100 }`
- Response: Array of `Assistant` objects with fields: `assistant_id` (UUID), `graph_id` (string), `config` (object), `context` (object), `created_at` (ISO datetime), `updated_at` (ISO datetime), `metadata` (object), `version` (integer), `name` (string), `description` (string|null).

### FR-2: Create a New Thread

**Command**: `langgraph-investigator thread-create [--metadata <json>]`

**Behavior**:
- Send a `POST /threads` request to the LangGraph server.
- Optionally accept metadata as a JSON string via the `--metadata` flag.
- Display the created thread's `thread_id`, `status`, `created_at`, and `metadata`.

**Input**:
- `--metadata` (optional): JSON string of key-value pairs to attach as thread metadata.

**Output**: Thread ID and creation details.

**API Details**:
- Endpoint: `POST {server_url}/threads`
- Request body: `{ "metadata": {...} }` (metadata optional)
- Response: `Thread` object with fields: `thread_id` (UUID), `created_at` (ISO datetime), `updated_at` (ISO datetime), `metadata` (object), `status` (string: "idle"|"busy"|"interrupted"|"error"), `config` (object), `values` (object).

### FR-3: Send a Request to an Agent

**Command**: `langgraph-investigator run --thread <thread_id> --assistant <assistant_id> --message <text>`

**Behavior**:
- Send a `POST /threads/{thread_id}/runs/wait` request to the LangGraph server with the user's message as input.
- The input format follows the LangGraph convention: `{ "input": { "messages": [{ "role": "human", "content": "<text>" }] } }`.
- Wait for the run to complete (the `/runs/wait` endpoint blocks until completion).
- Display the agent's response messages and the run status.
- Also display the `run_id` for reference in subsequent database extraction.

**Input**:
- `--thread` (required): UUID of the thread to use.
- `--assistant` (required): UUID or graph_id of the assistant/agent to invoke.
- `--message` (required): The user message text to send to the agent.

**Output**: Agent response content, run_id, and run status.

**API Details**:
- Endpoint: `POST {server_url}/threads/{thread_id}/runs/wait`
- Request body:
  ```json
  {
    "assistant_id": "<assistant_id>",
    "input": {
      "messages": [{ "role": "human", "content": "<message>" }]
    }
  }
  ```
- Response: The final state of the thread after the run completes, including `messages` array with the agent's response.
- Timeout: The CLI should use a generous HTTP timeout (at least 120 seconds) since agent execution can take time.

### FR-4: Extract Thread Data from PostgreSQL

**Command**: `langgraph-investigator extract --thread <thread_id> [--output <file>]`

**Behavior**:
- Connect directly to the PostgreSQL database that backs the LangGraph server.
- Query all tables for records related to the specified thread ID.
- Compile results into a structured JSON report.
- Display the report to stdout or write to a file if `--output` is specified.

**Input**:
- `--thread` (required): UUID of the thread to extract data for.
- `--output` (optional): File path to write the JSON output to.

**Output**: A JSON document containing all data for the thread, structured as follows:

```json
{
  "thread_id": "<uuid>",
  "extracted_at": "<ISO datetime>",
  "thread": { /* row from thread table */ },
  "runs": [ /* rows from run table where thread_id matches */ ],
  "checkpoints": [ /* rows from checkpoints table where thread_id matches */ ],
  "checkpoint_blobs": [ /* rows from checkpoint_blobs table where thread_id matches */ ],
  "checkpoint_writes": [ /* rows from checkpoint_writes table where thread_id matches */ ],
  "store": [ /* rows from store table where prefix starts with the thread_id */ ]
}
```

**Database Tables and Queries**:

1. **thread** table:
   - Query: `SELECT * FROM thread WHERE thread_id = $1`
   - Columns: `thread_id` (UUID), `created_at`, `updated_at`, `metadata` (JSONB), `status` (text), `config` (JSONB), `values` (JSONB), `interrupts` (JSONB), `error` (bytea), `state_updated_at`

2. **run** table:
   - Query: `SELECT * FROM run WHERE thread_id = $1 ORDER BY created_at ASC`
   - Columns: `run_id` (UUID), `thread_id` (UUID), `assistant_id` (UUID), `created_at`, `updated_at`, `metadata` (JSONB), `status` (text), `kwargs` (JSONB), `multitask_strategy` (text)

3. **checkpoints** table:
   - Query: `SELECT * FROM checkpoints WHERE thread_id = $1 ORDER BY checkpoint_id ASC`
   - Columns: `thread_id` (UUID), `checkpoint_id` (UUID), `run_id` (UUID), `parent_checkpoint_id` (UUID), `checkpoint` (JSONB), `metadata` (JSONB), `checkpoint_ns` (text)

4. **checkpoint_blobs** table:
   - Query: `SELECT thread_id, channel, version, type, length(blob) as blob_size, checkpoint_ns FROM checkpoint_blobs WHERE thread_id = $1`
   - Note: The `blob` column contains binary data. The extraction should include blob metadata (channel, version, type, size) but represent the binary content as base64-encoded strings or omit it with a size indicator, controlled by a `--include-blobs` flag.

5. **checkpoint_writes** table:
   - Query: `SELECT thread_id, checkpoint_id, task_id, idx, channel, type, length(blob) as blob_size, checkpoint_ns FROM checkpoint_writes WHERE thread_id = $1 ORDER BY checkpoint_id, idx`
   - Note: Same blob handling as checkpoint_blobs.

6. **store** table:
   - Query: `SELECT * FROM store WHERE prefix LIKE $1` (where $1 is the thread_id as a prefix pattern)
   - Note: Store entries may or may not be keyed by thread_id. If no results, the array is empty.

**Additional flags**:
- `--include-blobs`: When specified, include base64-encoded blob data from `checkpoint_blobs` and `checkpoint_writes`. Default behavior is to include only metadata and blob size.

---

## Non-Functional Requirements

### NFR-1: Configuration
- **Server URL**: Must be provided via environment variable `LANGGRAPH_SERVER_URL`. No default value. If not set, the tool must raise a clear error: `"LANGGRAPH_SERVER_URL environment variable is required"`.
- **PostgreSQL Connection String**: Must be provided via environment variable `LANGGRAPH_POSTGRES_URL`. No default value. If not set, the tool must raise a clear error: `"LANGGRAPH_POSTGRES_URL environment variable is required"`.
- **No fallback values**: Per project conventions, configuration values must never have defaults or fallbacks. Missing configuration must always result in an exception with a descriptive error message.
- **Configuration file**: Optionally support a `.env` file in the current working directory or `~/.langgraph-investigator/.env` for storing configuration. Environment variables take precedence over the file.

### NFR-2: Error Handling
- All HTTP requests must have proper error handling: network errors, non-2xx status codes, malformed JSON responses.
- PostgreSQL connection errors must produce clear messages (connection refused, authentication failed, database not found, SSL issues).
- Invalid UUIDs provided as arguments must be validated before making API calls.
- Timeouts for HTTP requests: minimum 120 seconds for run/wait endpoint, 30 seconds for other endpoints.

### NFR-3: Output Formatting
- Table output for list commands (agents) should be readable in terminal.
- JSON output for extract command should be pretty-printed by default.
- All timestamps should be displayed in ISO 8601 format.
- Binary data (bytea columns) should be represented as base64 strings when included, or as `{ "size": <bytes>, "type": "<content_type>" }` when excluded.

### NFR-4: Security
- PostgreSQL connection strings contain credentials and must not be logged or displayed in error messages.
- The tool should mask sensitive portions of connection strings in any diagnostic output.

### NFR-5: Performance
- Database queries should use parameterized queries (no string interpolation) to prevent SQL injection.
- The extract command should run all queries concurrently where possible to minimize total execution time.

---

## Technical Constraints

1. **Language**: TypeScript (per project conventions).
2. **Runtime**: Node.js with `tsx` for development execution.
3. **HTTP Client**: Use `node-fetch` or the native `fetch` API (Node.js 18+).
4. **PostgreSQL Client**: Use `pg` (node-postgres) library for database access.
5. **CLI Framework**: Use `commander` for argument parsing.
6. **Configuration**: Use `dotenv` for .env file support. No fallback values for any configuration variable.
7. **Build**: Standard TypeScript compilation with `tsconfig.json`.
8. **Package Manager**: npm with `package.json`.

---

## External Dependencies

### LangGraph Server API
- **Base URL**: Configurable via `LANGGRAPH_SERVER_URL`
- **Validation URL**: `https://nbg-webapp-cc-lg-test-we-dev-02-fthxhdbcegbredh3.westeurope-01.azurewebsites.net`
- **API Version**: LangGraph Platform v0.7.89, LangGraph Python v1.1.3
- **Authentication**: Currently no authentication required (self-hosted deployment)
- **Key Endpoints Used**:
  - `POST /assistants/search` - List agents
  - `POST /threads` - Create thread
  - `POST /threads/{thread_id}/runs/wait` - Execute run and wait for result
  - `GET /threads/{thread_id}` - Get thread details
  - `GET /threads/{thread_id}/runs` - List thread runs
  - `GET /threads/{thread_id}/history` - Get thread state history

### PostgreSQL Database
- **Connection String**: Configurable via `LANGGRAPH_POSTGRES_URL`
- **Validation URL**: `postgresql://directusersadmin:0ePsTCsosV7vhZGq@direct-users-postgres.postgres.database.azure.com:5432/langgraph_rag_handoff?sslmode=require`
- **Database Name**: `langgraph_rag_handoff`
- **Relevant Tables**:
  - `thread` - Thread metadata and state
  - `run` - Run execution records
  - `checkpoints` - Agent state checkpoints
  - `checkpoint_blobs` - Binary checkpoint data (channel states)
  - `checkpoint_writes` - Individual checkpoint write operations
  - `store` - Key-value store for agent long-term memory
- **Known Assistants on Server**: 1 assistant with graph_id `"agent"`, assistant_id `fe096781-5601-53d2-b2f6-0d3403f7e9ca`

### npm Packages Required
- `pg` - PostgreSQL client
- `commander` - CLI argument parsing
- `dotenv` - Environment variable loading from .env files
- `typescript` - TypeScript compiler
- `tsx` - TypeScript execution
- `@types/pg` - TypeScript types for pg
- `@types/node` - Node.js types

---

## Acceptance Criteria

### AC-1: List Agents
- [ ] Running `langgraph-investigator agents` against the validation server returns at least the "agent" assistant (ID: `fe096781-5601-53d2-b2f6-0d3403f7e9ca`).
- [ ] Output displays assistant_id, graph_id, name, version, and timestamps.
- [ ] Running without `LANGGRAPH_SERVER_URL` set produces a clear error message.

### AC-2: Create Thread
- [ ] Running `langgraph-investigator thread-create` creates a new thread and returns a valid UUID thread_id.
- [ ] The created thread is visible in the database `thread` table.
- [ ] The created thread status is "idle".
- [ ] Optional `--metadata '{"key":"value"}'` is persisted in the thread's metadata.

### AC-3: Send Request
- [ ] Running `langgraph-investigator run --thread <id> --assistant fe096781-5601-53d2-b2f6-0d3403f7e9ca --message "Hello"` produces an agent response.
- [ ] The response includes the agent's message content and the run_id.
- [ ] The run is recorded in the database `run` table with status "success".
- [ ] Invalid thread_id or assistant_id produces a clear error.

### AC-4: Extract Thread Data
- [ ] Running `langgraph-investigator extract --thread <id>` after AC-3 returns a JSON document with all sections populated.
- [ ] The `thread` section contains the thread record.
- [ ] The `runs` section contains at least one run record.
- [ ] The `checkpoints` section contains checkpoint records created during the run.
- [ ] The `checkpoint_blobs` section contains blob metadata (channel, version, type, size).
- [ ] The `checkpoint_writes` section contains write records.
- [ ] The `--output <file>` flag writes the JSON to the specified file.
- [ ] Running without `LANGGRAPH_POSTGRES_URL` set produces a clear error message.
- [ ] The `--include-blobs` flag includes base64-encoded binary data.

### AC-5: End-to-End Validation
- [ ] A test script performs the full flow: list agents -> create thread -> send request -> extract data.
- [ ] The extracted data is internally consistent: the thread_id matches across all tables, run_ids in checkpoints match runs, etc.
- [ ] The tool works correctly against both the provided validation server and database.

---

## Out of Scope

1. **Authentication/OAuth**: The current LangGraph server does not require authentication. Token-based auth is out of scope for the initial version.
2. **Streaming responses**: Only the wait-for-completion mode (`/runs/wait`) is supported. SSE streaming (`/runs/stream`) is out of scope.
3. **Assistant management**: Creating, updating, or deleting assistants is out of scope. The tool only reads/lists them.
4. **Thread management**: Deleting threads, pruning threads, or updating thread state directly is out of scope.
5. **Cron jobs**: LangGraph cron functionality is out of scope.
6. **Store management**: The Store API (put/get/delete items) is out of scope. Only reading store data via PostgreSQL for a given thread is in scope.
7. **A2A and MCP endpoints**: Agent-to-Agent and Model Context Protocol endpoints are out of scope.
8. **GUI/Web interface**: This is a CLI-only tool.
9. **Database writes**: The tool only reads from PostgreSQL. No writes or modifications to the database.
10. **Multi-server support**: The tool targets a single LangGraph server at a time, configured via environment variable.

---

## CLI Interface Summary

```
langgraph-investigator <command> [options]

Commands:
  agents                          List all available agents/assistants
  thread-create [--metadata <json>]  Create a new thread
  run --thread <id> --assistant <id> --message <text>  Send a request to an agent
  extract --thread <id> [--output <file>] [--include-blobs]  Extract all thread data from PostgreSQL

Environment Variables (required, no defaults):
  LANGGRAPH_SERVER_URL     Base URL of the LangGraph server
  LANGGRAPH_POSTGRES_URL   PostgreSQL connection string for the LangGraph database
```

---

## Validation Configuration

For development and testing, use the following values:

```bash
export LANGGRAPH_SERVER_URL="https://nbg-webapp-cc-lg-test-we-dev-02-fthxhdbcegbredh3.westeurope-01.azurewebsites.net"
export LANGGRAPH_POSTGRES_URL="postgresql://directusersadmin:0ePsTCsosV7vhZGq@direct-users-postgres.postgres.database.azure.com:5432/langgraph_rag_handoff?sslmode=require"
```

Known available assistant for testing:
- **assistant_id**: `fe096781-5601-53d2-b2f6-0d3403f7e9ca`
- **graph_id**: `agent`
- **name**: `agent`
