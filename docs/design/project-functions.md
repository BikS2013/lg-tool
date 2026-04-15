# LangGraph Investigator - Functional Requirements

## FR-1: List Available Agents

**Command**: `langgraph-investigator agents`

**Description**: Query a LangGraph server and display all available assistants/agents with their metadata.

**Behavior**:
- Send a `POST /assistants/search` request to the LangGraph server with `{"limit": 100}`
- Parse the response array of `Assistant` objects
- Display results in a formatted table showing: `assistant_id`, `graph_id`, `name`, `description`, `version`, `created_at`, `updated_at`
- If no assistants are found, display an informational message

**Input**: None (uses configured server URL via `LANGGRAPH_SERVER_URL`)

**Output**: Formatted table of assistants

---

## FR-2: Create a New Thread

**Command**: `langgraph-investigator thread-create [--metadata <json>]`

**Description**: Create a new thread on the LangGraph server and return the thread ID and metadata.

**Behavior**:
- Send a `POST /threads` request to the LangGraph server
- Optionally accept metadata as a JSON string via the `--metadata` flag
- Display the created thread's `thread_id`, `status`, `created_at`, and `metadata`

**Input**:
- `--metadata` (optional): JSON string of key-value pairs to attach as thread metadata

**Output**: Thread ID and creation details (thread_id, status, created_at, metadata)

---

## FR-3: Send a Request to an Agent

**Command**: `langgraph-investigator run --thread <thread_id> --assistant <assistant_id> --message <text>`

**Description**: Submit a user message to a specific agent within the context of a specific thread, wait for the response, and display the agent's output.

**Behavior**:
- Send a `POST /threads/{thread_id}/runs/wait` request with the user's message as input
- Input format: `{ "input": { "messages": [{ "role": "human", "content": "<text>" }] } }`
- Wait for the run to complete (the `/runs/wait` endpoint blocks until completion)
- Display the agent's response messages and the run status
- Display the `run_id` for reference in subsequent database extraction

**Input**:
- `--thread` (required): UUID of the thread to use
- `--assistant` (required): UUID or graph_id of the assistant/agent to invoke
- `--message` (required): The user message text to send to the agent

**Output**: Agent response content, run_id, and run status

---

## FR-4: Extract Thread Data from PostgreSQL

**Command**: `langgraph-investigator extract --thread <thread_id> [--output <file>] [--include-blobs]`

**Description**: Connect directly to the PostgreSQL database that backs the LangGraph server and extract all data related to a specific thread ID.

**Behavior**:
- Connect to the PostgreSQL database using `LANGGRAPH_POSTGRES_URL`
- Query all six tables for records related to the specified thread ID
- Compile results into a structured JSON report
- Display the report to stdout or write to a file if `--output` is specified

**Tables Queried**:
1. `thread` - Thread metadata and state
2. `run` - Run execution records
3. `checkpoints` - Agent state checkpoints
4. `checkpoint_blobs` - Binary checkpoint data (channel states)
5. `checkpoint_writes` - Individual checkpoint write operations
6. `store` - Key-value store for agent long-term memory

**Input**:
- `--thread` (required): UUID of the thread to extract data for
- `--output` (optional): File path to write the JSON output to
- `--include-blobs` (optional): When specified, include base64-encoded blob data from checkpoint tables. Default is metadata-only with blob size.

**Output**: JSON document structured as:
```json
{
  "thread_id": "<uuid>",
  "extracted_at": "<ISO datetime>",
  "thread": {},
  "runs": [],
  "checkpoints": [],
  "checkpoint_blobs": [],
  "checkpoint_writes": [],
  "store": []
}
```

---

## Non-Functional Requirements

### NFR-1: Configuration
- `LANGGRAPH_SERVER_URL` required via environment variable (no default)
- `LANGGRAPH_POSTGRES_URL` required via environment variable (no default)
- Optional `.env` file support (CWD and `~/.langgraph-investigator/.env`)
- Environment variables take precedence over `.env` values
- Missing configuration must always raise an exception with a descriptive error

### NFR-2: Error Handling
- HTTP requests: network errors, non-2xx status codes, malformed JSON
- PostgreSQL: connection refused, authentication failed, database not found, SSL issues
- UUID validation before API/DB calls
- Timeouts: 300 seconds for `/runs/wait`, 30 seconds for other endpoints

### NFR-3: Output Formatting
- Table output for agent listing (readable in terminal)
- Pretty-printed JSON for extract output
- ISO 8601 timestamps
- Binary data as base64 strings (when included) or `{ size, type }` metadata (default)

### NFR-4: Security
- PostgreSQL connection strings must not be logged or displayed in errors
- Credential masking in all diagnostic output

### NFR-5: Performance
- Parameterized queries only (no string interpolation) to prevent SQL injection
- Concurrent query execution via `Promise.all()` for the extract command
