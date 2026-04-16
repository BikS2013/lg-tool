# LangGraph Platform / Agent Server REST API Specification

> **Source date**: April 2026  
> **Official reference**: https://docs.langchain.com/langgraph-platform/server-api-ref  
> **API reference (LangSmith)**: https://docs.langchain.com/langsmith/agent-server-api/  

---

## Overview

The LangGraph Platform (now marketed as the **LangSmith Agent Server**) exposes a RESTful API with 30+ endpoints for managing agents, conversations, and executions. The API is organized around three primary resources:

| Resource | Description |
|---|---|
| **Assistants** | Named, versioned configurations of a deployed graph |
| **Threads** | Conversation containers that accumulate state across runs |
| **Runs** | Individual graph executions, either on a thread (stateful) or threadless (ephemeral) |

Additional resources include **Crons** (scheduled runs), **Store** (cross-thread long-term memory), **A2A** (Agent-to-Agent protocol), **MCP** (Model Context Protocol), and **System** (health/info).

### Base URL Format

```
https://<hostname>/
```

For local development with `langgraph dev`:
```
http://localhost:2024/
```

For LangSmith-hosted deployments:
```
https://api.smith.langchain.com/
```

The built-in interactive OpenAPI docs are available at each deployed server's `/docs` endpoint:
```
http://localhost:8124/docs
```

---

## Authentication

### Header

```
X-Api-Key: <LANGSMITH_API_KEY>
```

- **Header name**: `X-Api-Key`
- **Value**: A valid LangSmith API key for the organization where the Agent Server is deployed
- **Required for**: All requests to LangSmith-hosted or LangSmith-authenticated deployments
- **Local dev**: Authentication is not required when running `langgraph dev` locally (no `X-Api-Key` needed)

### Example

```bash
curl --request POST \
  --url https://<deployment-url>/assistants/search \
  --header 'Content-Type: application/json' \
  --header 'X-Api-Key: lsv2_pt_abc123...' \
  --data '{ "metadata": {}, "limit": 10, "offset": 0 }'
```

---

## Assistants API

An **assistant** is a graph paired with specific configuration settings. It represents a particular parameterization (model selection, prompts, tools, runtime context) of a deployed graph. Multiple assistants can be created per graph. When a graph is deployed, LangGraph Server automatically creates a default assistant for each graph using the graph's default configuration.

Assistants support **versioning** — every `PATCH` operation creates a new version, enabling rollback and A/B testing.

---

### POST /assistants/search

Search and list assistants. This is the primary endpoint for listing available assistants.

**URL**: `POST /assistants/search`  
**Auth header required**: Yes (for cloud deployments)

#### Request Body (`application/json`)

```json
{
  "metadata": {},
  "graph_id": "<string>",
  "name": "<string>",
  "limit": 10,
  "offset": 0,
  "sort_by": "assistant_id",
  "sort_order": "asc",
  "select": ["assistant_id", "graph_id", "name", "config", "metadata"]
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `metadata` | object | No | — | Key-value pairs for exact-match metadata filtering (JSONB containment) |
| `graph_id` | string | No | — | Filter by graph ID (as set in `langgraph.json`) |
| `name` | string | No | — | Case-insensitive substring match on assistant name |
| `limit` | integer | No | 10 | Max results to return (1–1000) |
| `offset` | integer | No | 0 | Number of results to skip (for pagination) |
| `sort_by` | enum | No | — | Sort field: `assistant_id`, `created_at`, `updated_at`, `name`, `graph_id` |
| `sort_order` | enum | No | — | `asc` or `desc` |
| `select` | string[] | No | all fields | Fields to include in response: `assistant_id`, `graph_id`, `name`, `description`, `config`, `context`, `created_at`, `updated_at`, `metadata`, `version` |

#### Response Body (200 OK)

Returns an array of assistant objects:

```json
[
  {
    "assistant_id": "3c90c3cc-0d44-4b50-8888-8dd25736052a",
    "graph_id": "agent",
    "config": {
      "tags": ["production"],
      "recursion_limit": 25,
      "configurable": {
        "model_name": "gpt-4o"
      }
    },
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z",
    "metadata": {
      "environment": "production"
    },
    "context": {},
    "version": 1,
    "name": "My Agent",
    "description": "A production-ready agent"
  }
]
```

| Field | Type | Description |
|---|---|---|
| `assistant_id` | string (UUID) | Unique identifier for the assistant |
| `graph_id` | string | ID of the underlying graph |
| `config` | object | Config including `tags`, `recursion_limit`, `configurable` |
| `config.tags` | string[] | Tags associated with this configuration |
| `config.recursion_limit` | integer | Max recursion depth for graph execution |
| `config.configurable` | object | Arbitrary runtime configuration key-value pairs |
| `created_at` | string (ISO 8601) | Creation timestamp |
| `updated_at` | string (ISO 8601) | Last update timestamp |
| `metadata` | object | Free-form metadata attached to the assistant |
| `context` | object | Static context provided to the assistant at runtime |
| `version` | integer | Version number (increments on each PATCH) |
| `name` | string | Human-readable name |
| `description` | string or null | Optional textual description |

#### Example curl

```bash
curl --request POST \
  --url https://<deployment-url>/assistants/search \
  --header 'Content-Type: application/json' \
  --header 'X-Api-Key: <LANGSMITH_API_KEY>' \
  --data '{
    "limit": 10,
    "offset": 0
  }'
```

---

### POST /assistants

Create a new assistant.

**URL**: `POST /assistants`  
**Auth header required**: Yes (for cloud deployments)

#### Request Body (`application/json`)

```json
{
  "graph_id": "agent",
  "assistant_id": "3c90c3cc-0d44-4b50-8888-8dd25736052a",
  "config": {
    "tags": ["<string>"],
    "recursion_limit": 25,
    "configurable": {}
  },
  "context": {},
  "metadata": {},
  "if_exists": "raise",
  "name": "My Assistant",
  "description": "Optional description"
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `graph_id` | string | Yes | — | The ID of the graph to use (from `langgraph.json`) |
| `assistant_id` | string (UUID) | No | auto-generated UUID | Custom ID for the assistant |
| `config` | object | No | — | Configuration for the graph |
| `context` | object | No | — | Static context added to the assistant |
| `metadata` | object | No | — | Metadata to attach |
| `if_exists` | enum | No | `raise` | `raise` = error on duplicate; `do_nothing` = return existing |
| `name` | string | No | `"Untitled"` | Human-readable name |
| `description` | string or null | No | null | Optional description |

#### Response Body (200 OK)

Returns a single assistant object (same schema as search response item above).

---

### GET /assistants/{assistant_id}

Get details of a specific assistant.

**URL**: `GET /assistants/{assistant_id}`  
**Auth header required**: Yes (for cloud deployments)

#### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `assistant_id` | string (UUID) | The assistant's unique identifier |

#### Response Body (200 OK)

Single assistant object (same schema as search response item).

---

### PATCH /assistants/{assistant_id}

Update an assistant. Creates a new version.

**URL**: `PATCH /assistants/{assistant_id}`  
**Auth header required**: Yes (for cloud deployments)

#### Request Body (`application/json`)

```json
{
  "graph_id": "<string>",
  "config": {},
  "context": {},
  "metadata": {},
  "name": "<string>",
  "description": "<string>"
}
```

All fields are optional; only provided fields are updated.

---

### DELETE /assistants/{assistant_id}

Delete an assistant.

**URL**: `DELETE /assistants/{assistant_id}`  
**Response**: 204 No Content

---

## Threads API

A **thread** is a conversation container that accumulates state across multiple runs. Each thread holds the complete state history of a conversation, accessible as checkpoints.

Thread status is managed automatically based on run states:
- `idle` — no active runs
- `busy` — a run is currently executing
- `interrupted` — execution was interrupted (e.g., awaiting human input)
- `error` — the last run failed

---

### POST /threads

Create a new thread.

**URL**: `POST /threads`  
**Auth header required**: Yes (for cloud deployments)

#### Request Body (`application/json`)

```json
{
  "thread_id": "3c90c3cc-0d44-4b50-8888-8dd25736052a",
  "metadata": {
    "user_id": "user-123",
    "session": "abc"
  },
  "if_exists": "raise",
  "ttl": {
    "strategy": "delete",
    "minutes": 60
  },
  "supersteps": []
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `thread_id` | string (UUID) | No | auto-generated | Custom thread ID |
| `metadata` | object | No | — | Free-form key-value metadata attached to the thread |
| `if_exists` | enum | No | `raise` | `raise` = error on duplicate; `do_nothing` = return existing |
| `ttl` | object | No | — | Time-to-live configuration for the thread |
| `ttl.strategy` | string | No | — | TTL strategy (e.g., `delete`) |
| `ttl.minutes` | integer | No | — | Minutes until thread expires |
| `supersteps` | object[] | No | — | Optional initial supersteps to populate the thread state |

#### Response Body (200 OK)

```json
{
  "thread_id": "3c90c3cc-0d44-4b50-8888-8dd25736052a",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "metadata": {
    "user_id": "user-123"
  },
  "status": "idle",
  "state_updated_at": "2024-01-15T10:30:00Z",
  "config": {},
  "values": {},
  "interrupts": {}
}
```

| Field | Type | Description |
|---|---|---|
| `thread_id` | string (UUID) | Unique identifier for the thread |
| `created_at` | string (ISO 8601) | Creation timestamp |
| `updated_at` | string (ISO 8601) | Last update timestamp |
| `metadata` | object | Thread metadata |
| `status` | enum | `idle`, `busy`, `interrupted`, or `error` |
| `state_updated_at` | string (ISO 8601) | When thread state was last updated |
| `config` | object | Thread-level config |
| `values` | object | Current state of the thread (the graph's state schema values) |
| `interrupts` | object | Current interrupt data if thread is in interrupted status |
| `ttl` | object | TTL information (only present when `?include=ttl` query param is passed) |

#### Example curl

```bash
curl --request POST \
  --url https://<deployment-url>/threads \
  --header 'Content-Type: application/json' \
  --header 'X-Api-Key: <LANGSMITH_API_KEY>' \
  --data '{
    "metadata": {
      "user_id": "user-123"
    }
  }'
```

---

### GET /threads/{thread_id}

Get details of a specific thread including current state.

**URL**: `GET /threads/{thread_id}`  
**Auth header required**: Yes (for cloud deployments)

#### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `thread_id` | string (UUID) | The thread's unique identifier |

#### Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `include` | string | Comma-separated additional data to include (e.g., `ttl`) |

#### Response Body (200 OK)

Same schema as the thread create response.

---

### POST /threads/search

Search for threads by metadata or other criteria.

**URL**: `POST /threads/search`  
**Auth header required**: Yes (for cloud deployments)

#### Request Body (`application/json`)

```json
{
  "metadata": {
    "user_id": "user-123"
  },
  "limit": 10,
  "offset": 0,
  "status": "idle",
  "sort_by": "created_at",
  "sort_order": "desc"
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `metadata` | object | No | — | Key-value pairs for exact-match metadata filtering (JSONB containment) |
| `limit` | integer | No | 10 | Max results to return (1–1000) |
| `offset` | integer | No | 0 | Number of results to skip |
| `status` | enum | No | — | Filter by status: `idle`, `busy`, `interrupted`, `error` |
| `sort_by` | string | No | — | Field to sort by |
| `sort_order` | enum | No | — | `asc` or `desc` |

#### Response Body (200 OK)

Array of thread objects (same schema as thread create response).

---

### PATCH /threads/{thread_id}

Update a thread's metadata or values.

**URL**: `PATCH /threads/{thread_id}`

#### Request Body

```json
{
  "metadata": {},
  "values": {}
}
```

---

### DELETE /threads/{thread_id}

Delete a thread and all associated state.

**URL**: `DELETE /threads/{thread_id}`  
**Response**: 204 No Content

---

### GET /threads/{thread_id}/history

Get the full state history of a thread (all checkpoints).

**URL**: `GET /threads/{thread_id}/history`

#### Response Body (200 OK)

Array of checkpoint/state snapshot objects ordered by checkpoint time.

---

### GET /threads/{thread_id}/state

Get the current state of a thread.

**URL**: `GET /threads/{thread_id}/state`

---

### POST /threads/{thread_id}/copy

Create an independent copy of a thread.

**URL**: `POST /threads/{thread_id}/copy`

---

## Runs API

A **run** is an individual execution of a graph. Runs can be:
- **Stateful (thread runs)**: Associated with a thread, persisting state to the thread between runs
- **Stateless**: Ephemeral runs with no state persistence

All run endpoints share the core `RunCreate` schema.

### Run Variants per Endpoint

| Endpoint | Behavior |
|---|---|
| `POST /threads/{thread_id}/runs` | Create background run on thread (returns run object immediately) |
| `POST /threads/{thread_id}/runs/stream` | Create streaming run on thread (returns SSE stream) |
| `POST /threads/{thread_id}/runs/wait` | Create run on thread and wait for result (blocking) |
| `POST /runs` | Create stateless background run |
| `POST /runs/stream` | Create stateless streaming run |
| `POST /runs/wait` | Create stateless run and wait for result |

---

### POST /threads/{thread_id}/runs/stream

Create a new streaming run on a thread targeting a specific assistant.

**URL**: `POST /threads/{thread_id}/runs/stream`  
**Auth header required**: Yes (for cloud deployments)

#### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `thread_id` | string (UUID) | The thread to run on |

#### Request Body (`application/json`)

```json
{
  "assistant_id": "3c90c3cc-0d44-4b50-8888-8dd25736052a",
  "checkpoint": {
    "thread_id": "<string>",
    "checkpoint_ns": "<string>",
    "checkpoint_id": "<string>",
    "checkpoint_map": {}
  },
  "input": {
    "messages": [
      {
        "role": "human",
        "content": "What is the weather in NYC?"
      }
    ]
  },
  "command": {
    "update": {},
    "resume": {},
    "goto": {
      "node": "<string>",
      "input": {}
    }
  },
  "metadata": {},
  "config": {
    "tags": ["<string>"],
    "recursion_limit": 25,
    "configurable": {
      "model_name": "gpt-4o"
    }
  },
  "context": {},
  "webhook": "https://my.app.com/hooks/langgraph",
  "interrupt_before": ["tools"],
  "interrupt_after": [],
  "stream_mode": ["values"],
  "stream_subgraphs": false,
  "stream_resumable": false,
  "feedback_keys": ["<string>"],
  "multitask_strategy": "reject",
  "if_not_exists": "reject",
  "after_seconds": 0,
  "checkpoint_during": false,
  "durability": "async",
  "on_disconnect": "continue"
}
```

#### Request Body Fields — Full Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `assistant_id` | string (UUID or name) | Yes | The assistant (graph) to execute. Can be the UUID or the graph name (e.g., `"agent"`) |
| `input` | object | No | Input to the graph. Structure depends on the graph's state schema; commonly contains a `messages` array |
| `command` | object | No | Structured command for resuming after interrupts. Use `update`, `resume`, or `goto` |
| `command.update` | object | No | State update to apply before resuming |
| `command.resume` | object | No | Resume data to inject at the interrupt point |
| `command.goto` | object | No | Jump to a specific node with optional input |
| `checkpoint` | object | No | Checkpoint to resume from (for time-travel or replay) |
| `checkpoint.thread_id` | string | No | Thread ID of the checkpoint |
| `checkpoint.checkpoint_ns` | string | No | Namespace of the checkpoint |
| `checkpoint.checkpoint_id` | string | No | Specific checkpoint ID to resume from |
| `checkpoint.checkpoint_map` | object | No | Map of checkpoints for subgraph resumption |
| `config` | object | No | Run-level configuration |
| `config.tags` | string[] | No | Tags for this run |
| `config.recursion_limit` | integer | No | Max recursion depth (default: 25) |
| `config.configurable` | object | No | Arbitrary configurable key-value pairs passed to the graph |
| `context` | object | No | Static context added to this run |
| `metadata` | object | No | Free-form metadata attached to the run |
| `interrupt_before` | string[] or `"*"` | No | Node names to interrupt immediately before execution. `"*"` = all nodes |
| `interrupt_after` | string[] or `"*"` | No | Node names to interrupt immediately after execution. `"*"` = all nodes |
| `stream_mode` | string[] | No | Streaming modes: `values`, `updates`, `events`, `messages`, `messages-tuple`, `debug`, `custom` |
| `stream_subgraphs` | boolean | No | Whether to stream output from subgraphs (default: `false`) |
| `stream_resumable` | boolean | No | Whether to persist stream chunks for later resumption (default: `false`) |
| `feedback_keys` | string[] | No | Keys to collect feedback on after run completion |
| `multitask_strategy` | enum | No | How to handle concurrent runs on the same thread: `reject`, `interrupt`, `rollback`, `enqueue` (default: `reject`) |
| `if_not_exists` | enum | No | Behavior when thread doesn't exist: `reject` (default) or `create` |
| `after_seconds` | integer | No | Delay in seconds before starting the run (scheduled execution) |
| `checkpoint_during` | boolean | No | Whether to write checkpoints during execution (default: `false` for most modes) |
| `durability` | enum | No | Checkpoint durability: `async` (after each step, default) or `exit` (only on completion) |
| `on_disconnect` | enum | No | Behavior when the client disconnects from the stream: `continue` or `cancel` |
| `webhook` | string (URL) | No | Webhook URL to call after run completion |

#### `stream_mode` Values Explained

| Mode | Description |
|---|---|
| `values` | Full graph state after each node executes |
| `updates` | Only the state delta (changes) after each node |
| `events` | Raw LangChain events emitted during execution |
| `messages` | Individual message chunks as they are generated |
| `messages-tuple` | Messages with metadata as (message, metadata) tuples |
| `debug` | Detailed debug events for each step |
| `custom` | Custom events dispatched via `dispatch_custom_event` |

#### Response — Server-Sent Events (SSE) stream

For streaming endpoints, the response is a stream of server-sent events. Each event has the format:

```
event: <event_type>
data: <json_payload>

```

Common event types (depend on `stream_mode`):

```
event: values
data: {"messages": [...], "other_state_key": ...}

event: updates
data: {"my_node": {"messages": [...]}}

event: end
data: null

event: error
data: {"error": "..."}
```

---

### POST /threads/{thread_id}/runs

Create a background run on a thread (non-streaming, returns immediately with run metadata).

**URL**: `POST /threads/{thread_id}/runs`  
**Auth header required**: Yes

#### Request Body

Same schema as `/threads/{thread_id}/runs/stream` above.

#### Response Body (200 OK)

```json
{
  "run_id": "3c90c3cc-0d44-4b50-8888-8dd25736052a",
  "thread_id": "3c90c3cc-0d44-4b50-8888-8dd25736052a",
  "assistant_id": "3c90c3cc-0d44-4b50-8888-8dd25736052a",
  "created_at": "2023-11-07T05:31:56Z",
  "updated_at": "2023-11-07T05:31:56Z",
  "status": "pending",
  "metadata": {},
  "kwargs": {},
  "multitask_strategy": "reject"
}
```

| Field | Type | Description |
|---|---|---|
| `run_id` | string (UUID) | Unique identifier for this run |
| `thread_id` | string (UUID) | Thread this run belongs to |
| `assistant_id` | string (UUID) | Assistant used for this run |
| `created_at` | string (ISO 8601) | Creation timestamp |
| `updated_at` | string (ISO 8601) | Last update timestamp |
| `status` | enum | `pending`, `running`, `success`, `error`, `timeout`, `interrupted` |
| `metadata` | object | Run metadata |
| `kwargs` | object | The original run invocation parameters |
| `multitask_strategy` | enum | Multitask strategy that was applied |

---

### POST /threads/{thread_id}/runs/wait

Create a run on a thread and block until completion, then return the final state.

**URL**: `POST /threads/{thread_id}/runs/wait`

#### Request Body

Same schema as `/threads/{thread_id}/runs/stream`.

#### Response Body (200 OK)

Final graph state values (the thread's state after the run completes):

```json
{
  "messages": [
    {"role": "human", "content": "What is the weather in NYC?"},
    {"role": "ai", "content": "The weather in NYC is currently 72°F and partly cloudy."}
  ]
}
```

---

### GET /threads/{thread_id}/runs

List all runs for a thread.

**URL**: `GET /threads/{thread_id}/runs`

#### Response Body (200 OK)

Array of run objects (same schema as background run response).

---

### GET /threads/{thread_id}/runs/{run_id}

Get details of a specific run.

**URL**: `GET /threads/{thread_id}/runs/{run_id}`

#### Response Body (200 OK)

Single run object.

---

### POST /runs/stream (Stateless)

Create a stateless (ephemeral) streaming run with no thread persistence.

**URL**: `POST /runs/stream`  
**Auth header required**: Yes

#### Request Body (`application/json`)

```json
{
  "assistant_id": "agent",
  "input": {
    "messages": [
      {
        "role": "human",
        "content": "What is LangGraph?"
      }
    ]
  },
  "command": {
    "update": {},
    "resume": {},
    "goto": {
      "node": "<string>",
      "input": {}
    }
  },
  "metadata": {},
  "config": {
    "tags": ["<string>"],
    "recursion_limit": 25,
    "configurable": {}
  },
  "context": {},
  "webhook": "<string>",
  "stream_mode": ["values"],
  "feedback_keys": ["<string>"],
  "stream_subgraphs": false,
  "stream_resumable": false,
  "on_completion": "delete",
  "after_seconds": 0,
  "checkpoint_during": false,
  "durability": "async",
  "on_disconnect": "continue"
}
```

Stateless-specific field:

| Field | Type | Description |
|---|---|---|
| `on_completion` | enum | Action after run completes: `delete` (discard state) or `keep` |

Note: Stateless runs do NOT have `if_not_exists`, `multitask_strategy`, or `interrupt_*` fields that relate to thread management.

#### Response

Same SSE stream format as thread runs.

#### Example curl

```bash
curl -s --request POST \
  --url https://<DEPLOYMENT_URL>/runs/stream \
  --header 'Content-Type: application/json' \
  --header 'X-Api-Key: <LANGSMITH_API_KEY>' \
  --data '{
    "assistant_id": "agent",
    "input": {
      "messages": [
        {
          "role": "human",
          "content": "What is LangGraph?"
        }
      ]
    },
    "stream_mode": "updates"
  }'
```

---

## Complete Example: Full Conversation Flow

This example shows creating a thread, sending a message, and getting the response.

```bash
# Step 1: Create a thread
THREAD=$(curl -s --request POST \
  --url https://<DEPLOYMENT_URL>/threads \
  --header 'Content-Type: application/json' \
  --header 'X-Api-Key: <API_KEY>' \
  --data '{"metadata": {"user_id": "user-123"}}')

THREAD_ID=$(echo $THREAD | jq -r '.thread_id')

# Step 2: Find the assistant (graph) to use
ASSISTANT=$(curl -s --request POST \
  --url https://<DEPLOYMENT_URL>/assistants/search \
  --header 'Content-Type: application/json' \
  --header 'X-Api-Key: <API_KEY>' \
  --data '{"limit": 1}')

ASSISTANT_ID=$(echo $ASSISTANT | jq -r '.[0].assistant_id')

# Step 3: Stream a run on the thread
curl -s --request POST \
  --url "https://<DEPLOYMENT_URL>/threads/$THREAD_ID/runs/stream" \
  --header 'Content-Type: application/json' \
  --header 'X-Api-Key: <API_KEY>' \
  --data "{
    \"assistant_id\": \"$ASSISTANT_ID\",
    \"input\": {
      \"messages\": [
        {
          \"role\": \"human\",
          \"content\": \"Hello, what can you help me with?\"
        }
      ]
    },
    \"stream_mode\": [\"values\"]
  }"
```

---

## Store API (Cross-Thread Long-Term Memory)

The Store API provides a persistent key-value store for long-term memory that persists across threads.

### PUT /store/items

Store a value.

```bash
curl --request PUT \
  --url https://<DEPLOYMENT_URL>/store/items \
  --header 'Content-Type: application/json' \
  --header 'X-Api-Key: <API_KEY>' \
  --data '{
    "namespace": ["user", "user-123", "preferences"],
    "key": "favorite_color",
    "value": {"color": "blue"}
  }'
```

### GET /store/items

Retrieve a stored value.

```
GET /store/items?namespace=user,user-123,preferences&key=favorite_color
```

### POST /store/items/search

Search stored items by namespace prefix or metadata.

---

## Crons API

Create scheduled (periodic) runs on a thread or stateless.

### POST /crons

```json
{
  "assistant_id": "<assistant_id>",
  "thread_id": "<thread_id>",
  "schedule": "0 * * * *",
  "input": {},
  "config": {},
  "metadata": {}
}
```

---

## System API

### GET /ok

Health check endpoint. Returns `200 OK` if the server is running.

### GET /info

Returns server information including version, capabilities, and configuration.

---

## PostgreSQL Database Schema

### Overview

LangGraph Platform uses PostgreSQL as its primary persistence backend. All core resource data is always stored in PostgreSQL. Three categories of data are persisted:

| Category | Storage | Tables |
|---|---|---|
| Core resources | PostgreSQL (always) | `assistants`, `threads`, `runs`, `cron` |
| Checkpoints (short-term memory) | PostgreSQL (default), configurable | `checkpoints`, `checkpoint_blobs`, `checkpoint_writes` |
| Store (long-term memory) | PostgreSQL (default), configurable | `store` |

Redis is used for ephemeral pub/sub (streaming events, cancellation signals) only — **no user or run data is stored in Redis**.

---

### Core Resource Tables (LangGraph Server Internal)

These tables are managed by the LangGraph Server API internally. The schema is part of the proprietary `langgraph-api` package and is not publicly documented in DDL form, but the following structure is inferred from the API surface and documentation:

#### `assistants` table

Stores assistant configurations.

| Column | Type | Description |
|---|---|---|
| `assistant_id` | UUID (PK) | Primary key |
| `graph_id` | text | Reference to graph name |
| `config` | JSONB | Full config object (`tags`, `recursion_limit`, `configurable`) |
| `context` | JSONB | Static context |
| `metadata` | JSONB | Free-form metadata (indexed for filtering) |
| `name` | text | Human-readable name |
| `description` | text | Optional description |
| `version` | integer | Version counter (increments on PATCH) |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |

#### `threads` table

Stores thread metadata and current state.

| Column | Type | Description |
|---|---|---|
| `thread_id` | UUID (PK) | Primary key |
| `metadata` | JSONB | Thread metadata (indexed for JSONB containment queries) |
| `status` | text | `idle`, `busy`, `interrupted`, `error` |
| `config` | JSONB | Thread-level config |
| `values` | JSONB | Current accumulated state of the thread |
| `interrupts` | JSONB | Current interrupt data |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |
| `state_updated_at` | timestamptz | When state was last updated |

#### `runs` table

Stores run records and their execution state.

| Column | Type | Description |
|---|---|---|
| `run_id` | UUID (PK) | Primary key |
| `thread_id` | UUID (FK) | Reference to `threads.thread_id` |
| `assistant_id` | UUID (FK) | Reference to `assistants.assistant_id` |
| `status` | text | `pending`, `running`, `success`, `error`, `timeout`, `interrupted` |
| `metadata` | JSONB | Run metadata |
| `kwargs` | JSONB | Original invocation parameters (input, config, etc.) |
| `multitask_strategy` | text | Strategy used for concurrent run management |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |

#### `cron` table

Stores scheduled run configurations.

| Column | Type | Description |
|---|---|---|
| `cron_id` | UUID (PK) | Primary key |
| `assistant_id` | UUID (FK) | Target assistant |
| `thread_id` | UUID (FK, nullable) | Target thread (null for stateless) |
| `schedule` | text | Cron expression (e.g., `"0 * * * *"`) |
| `input` | JSONB | Input to pass on each invocation |
| `config` | JSONB | Config to use |
| `metadata` | JSONB | Cron metadata |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |

---

### Checkpoint Tables (Open Source, `langgraph-checkpoint-postgres`)

These tables are created by calling `checkpointer.setup()` and are part of the open-source `langgraph-checkpoint-postgres` package. LangGraph Server manages these automatically.

#### `checkpoints` table

Stores snapshots of graph state at each super-step.

```sql
-- Primary key: (thread_id, checkpoint_ns, checkpoint_id)
-- Retrieval pattern:
SELECT checkpoint_id, parent_checkpoint_id, checkpoint, metadata
FROM checkpoints
WHERE thread_id = $1 AND checkpoint_ns = $2
ORDER BY checkpoint_id DESC LIMIT 1;

-- Insert/update pattern:
INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, checkpoint, metadata)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (thread_id, checkpoint_ns, checkpoint_id)
DO UPDATE SET checkpoint = EXCLUDED.checkpoint, metadata = EXCLUDED.metadata;
```

| Column | Type | Description |
|---|---|---|
| `thread_id` | text | Links to thread (PK component) |
| `checkpoint_ns` | text | Namespace — empty string for root graph, subgraph name for subgraphs (PK component) |
| `checkpoint_id` | text | Unique checkpoint identifier, monotonically increasing (PK component) |
| `parent_checkpoint_id` | text | Parent checkpoint ID (for state history traversal) |
| `checkpoint` | JSONB | Core state values at this snapshot |
| `metadata` | JSONB | Checkpoint metadata (source, step number, writes) |

#### `checkpoint_blobs` table

Stores large serialized objects (e.g., message histories) that are too large for inline JSONB storage.

| Column | Type | Description |
|---|---|---|
| `thread_id` | text | Thread reference (PK component) |
| `checkpoint_ns` | text | Namespace (PK component) |
| `channel` | text | State channel name (PK component) |
| `version` | text | Version identifier (PK component) |
| `type` | text | Serialization type (e.g., `msgpack`, `json`) |
| `blob` | bytea | Serialized object (pickle/msgpack binary) |

#### `checkpoint_writes` table

Stores pending/intermediate writes associated with a checkpoint (used for fault-tolerance).

| Column | Type | Description |
|---|---|---|
| `thread_id` | text | Thread reference (PK component) |
| `checkpoint_ns` | text | Namespace (PK component) |
| `checkpoint_id` | text | Checkpoint reference (PK component) |
| `task_id` | text | Task identifier (PK component) |
| `idx` | integer | Write index (PK component) |
| `channel` | text | State channel being written |
| `type` | text | Serialization type |
| `blob` | bytea | Serialized write value |

---

### Store Table (Long-Term Memory)

#### `store` table

Stores cross-thread long-term memory items.

| Column | Type | Description |
|---|---|---|
| `prefix` | text | Namespace path prefix (PK component) |
| `key` | text | Item key within namespace (PK component) |
| `value` | JSONB | Stored value |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update timestamp |

---

## SDK Usage Reference

The official LangGraph SDK simplifies interaction with the REST API.

### Python SDK

```python
from langgraph_sdk import get_client, get_sync_client

# Async client
client = get_client(url="https://<deployment-url>", api_key="lsv2_pt_...")

# List assistants
assistants = await client.assistants.search(limit=10, offset=0)

# Create thread
thread = await client.threads.create(metadata={"user_id": "user-123"})

# Stream a run
async for chunk in client.runs.stream(
    thread["thread_id"],
    assistants[0]["assistant_id"],
    input={"messages": [{"role": "human", "content": "Hello!"}]},
    stream_mode="updates"
):
    print(f"Event type: {chunk.event}")
    print(chunk.data)

# Stateless streaming run
async for chunk in client.runs.stream(
    None,  # None = threadless/stateless
    "agent",
    input={"messages": [{"role": "human", "content": "Hello!"}]},
    stream_mode="messages-tuple"
):
    print(chunk)
```

### JavaScript/TypeScript SDK

```typescript
import { Client } from "@langchain/langgraph-sdk";

const client = new Client({ 
  apiUrl: "https://<deployment-url>",
  apiKey: "lsv2_pt_..."
});

// List assistants
const assistants = await client.assistants.search({ limit: 10, offset: 0 });

// Create thread
const thread = await client.threads.create({ metadata: { userId: "user-123" } });

// Stream a run
const stream = client.runs.stream(
  thread.thread_id,
  assistants[0].assistant_id,
  {
    input: { messages: [{ role: "human", content: "Hello!" }] },
    streamMode: "updates"
  }
);

for await (const chunk of stream) {
  console.log(chunk.event, chunk.data);
}
```

---

## Assumptions & Scope

### Assumptions Made

| Assumption | Confidence | Impact if Wrong |
|---|---|---|
| The `X-Api-Key` header with a LangSmith API key is the only auth mechanism for LangSmith-hosted deployments | HIGH | Self-hosted deployments may use a different key or no key at all |
| The internal `assistants`, `threads`, `runs`, and `cron` table schemas are inferred from the API surface — not from public DDL | MEDIUM | Exact column names, types, or indexes may differ; additional columns may exist |
| `checkpoint_blobs` uses pickle/msgpack serialization | HIGH | Confirmed by open-source checkpoint-postgres library code |
| The default `langgraph dev` server runs on port 2024 | HIGH | Confirmed by documentation |
| LangGraph Server self-hosted deployments run on port 8124 by default | MEDIUM | Port may vary by deployment configuration |
| `checkpoint_ns` is empty string for root graphs and the subgraph name for subgraphs | HIGH | Confirmed by checkpoint-postgres library code |

### Uncertainties & Gaps

- **Internal schema DDL**: The LangGraph Server `langgraph-api` package is proprietary and closed-source. The `assistants`, `threads`, `runs`, and `cron` table schemas documented here are inferred from the REST API response shapes and changelog references, not from actual DDL inspection. Exact index definitions, constraints, and additional columns are unknown.
- **Store table DDL**: The `store` table structure is similarly inferred from the API and may have additional indexing columns (e.g., a GIN index on value for search).
- **Self-hosted authentication**: For fully self-hosted deployments (not going through LangSmith), the authentication mechanism may differ. Custom auth can be implemented via LangGraph's auth middleware.
- **`checkpoint_writes` retention**: It is unclear whether `checkpoint_writes` rows are cleaned up after run completion or retained indefinitely.
- **Multitask strategies**: The exact behavior of `rollback` vs `interrupt` vs `enqueue` strategies and their interaction with the checkpoint tables is not fully documented.

### Out of Scope

- LangGraph Python library internals (graph definition, nodes, edges)
- LangGraph Studio (local GUI development tool)
- Vertex AI Agent Builder integration (Google Cloud's hosted LangGraph)
- A2A (Agent-to-Agent Protocol) endpoints — emerging spec, details sparse
- MCP (Model Context Protocol) endpoints

---

## Clarifying Questions for Follow-up

1. Is this for a self-hosted LangGraph deployment (using a custom API key/no auth) or a LangSmith-hosted deployment?
2. Does the target deployment use MongoDB as the checkpoint backend instead of PostgreSQL?
3. Is direct database access to the PostgreSQL instance needed, or is REST API interaction sufficient?
4. Are subgraphs used in the target deployment? (Affects `checkpoint_ns` and `checkpoint_blobs` volume)
5. Is the `langgraph dev` local development server being used, or a production deployment?

---

## References

| # | Source | URL |
|---|---|---|
| 1 | LangSmith Agent Server API Reference Index | https://docs.langchain.com/langgraph-platform/server-api-ref |
| 2 | Agent Server Overview | https://docs.langchain.com/langsmith/agent-server |
| 3 | Agent Server — Assistants API | https://docs.langchain.com/langsmith/agent-server-api/assistants |
| 4 | Agent Server — Search Assistants | https://docs.langchain.com/langsmith/agent-server-api/assistants/search-assistants |
| 5 | Agent Server — Threads API | https://docs.langchain.com/langsmith/agent-server-api/threads |
| 6 | Agent Server — Thread Runs API | https://docs.langchain.com/langsmith/agent-server-api/thread-runs |
| 7 | Agent Server — Create Run Stream Output | https://docs.langchain.com/langsmith/agent-server-api/thread-runs/create-run-stream-output |
| 8 | Agent Server — Stateless Runs API | https://docs.langchain.com/langsmith/agent-server-api/stateless-runs |
| 9 | LangGraph Platform API Reference (legacy) | https://langchain-ai.github.io/langgraph/cloud/reference/api/api_ref.html |
| 10 | LangGraph checkpoint-postgres source | https://github.com/langchain-ai/langgraph/blob/main/libs/checkpoint-postgres/langgraph/checkpoint/postgres/__init__.py |
| 11 | LangGraph checkpoint-postgres store source | https://github.com/langchain-ai/langgraph/blob/main/libs/checkpoint-postgres/langgraph/store/postgres/base.py |
| 12 | LangGraph Checkpoint PostgreSQL Internals (blog) | https://blog.lordpatil.com/posts/langgraph-postgres-checkpointer/ |
| 13 | Understanding Checkpointers, Databases, API Memory and TTL | https://support.langchain.com/articles/6253531756 |
| 14 | langgraph-checkpoint-postgres on PyPI | https://pypi.org/project/langgraph-checkpoint-postgres/ |
| 15 | Agent Server Changelog | https://docs.langchain.com/langsmith/agent-server-changelog |
| 16 | Context7 LangGraph Python docs | https://docs.langchain.com/oss/python/langgraph/ |
