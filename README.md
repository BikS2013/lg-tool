# lg-tool

CLI tool for interacting with LangGraph servers and inspecting the underlying PostgreSQL data that backs a LangGraph deployment.

It provides five operations:

- List agents/assistants exposed by a LangGraph server.
- Create a thread.
- Send a message to an assistant on a thread.
- Extract every PostgreSQL row that belongs to a given thread (threads, runs, checkpoints, writes, blobs).
- Identify the documents retrieved by a thread's RAG pipeline.

## Requirements

- Node.js `>= 18`
- Network access to a running LangGraph server (for the `agents`, `thread-create`, and `run` commands).
- Read access to the PostgreSQL database that backs the LangGraph server (for the `extract` and `documents` commands).

## Installation

```bash
npm install
```

For a global `lg-tool` binary:

```bash
npm run build
npm link
```

## Configuration

All configuration is supplied through environment variables. There are **no defaults** — a missing required variable raises an error.

| Variable | Required for | Description |
| --- | --- | --- |
| `LANGGRAPH_SERVER_URL` | `agents`, `thread-create`, `run` | Base URL of the LangGraph server (e.g. `https://my-server.azurewebsites.net`). |
| `LANGGRAPH_POSTGRES_URL` | `extract`, `documents` | PostgreSQL connection string for the LangGraph database. |
| `LANGGRAPH_TEST_ASSISTANT_ID` | `test:e2e` only | UUID of a known assistant deployed on the server, used by the end-to-end test. |

### Resolution priority

Highest priority wins:

1. Shell environment variables
2. `.env` file in the current working directory
3. `~/.lg-tool/.env`

Copy `.env.example` to `.env` to get started:

```bash
cp .env.example .env
# then edit .env with your values
```

## Commands

### `agents`

List all available agents/assistants.

```bash
lg-tool agents
```

### `thread-create`

Create a new thread, optionally with metadata.

```bash
lg-tool thread-create
lg-tool thread-create --metadata '{"purpose": "testing"}'
```

### `run`

Send a message to an assistant on an existing thread.

```bash
lg-tool run \
  --thread <thread-uuid> \
  --assistant <assistant-uuid-or-graph-id> \
  --message "Hello"
```

| Option | Required | Description |
| --- | --- | --- |
| `--thread <id>` | yes | Thread UUID. |
| `--assistant <id>` | yes | Assistant UUID or graph_id. |
| `--message <text>` | yes | Message to send. |

### `extract`

Extract every PostgreSQL row tied to a given thread and write the result to stdout or to a JSON file.

```bash
lg-tool extract --thread <thread-uuid>
lg-tool extract --thread <thread-uuid> --output extraction.json
lg-tool extract --thread <thread-uuid> --include-blobs
```

| Option | Required | Description |
| --- | --- | --- |
| `--thread <id>` | yes | Thread UUID. |
| `--output <file>` | no | Output file path. If omitted, prints to stdout. |
| `--include-blobs` | no | Include base64-encoded blob payloads (omitted by default to keep output small). |

### `documents`

List the documents retrieved by a thread's RAG pipeline.

```bash
lg-tool documents --thread <thread-uuid>
lg-tool documents --thread <thread-uuid> --output docs.json
```

| Option | Required | Description |
| --- | --- | --- |
| `--thread <id>` | yes | Thread UUID. |
| `--output <file>` | no | Output file path. If omitted, prints to stdout. |

## Development

```bash
npm run dev -- <command> [options]   # run via tsx without compiling
npm run build                        # compile to dist/
npm run typecheck                    # type-check only
```

## Tests

```bash
npm run test:config       # config-module tests (5 cases)
npm run test:utils        # utils + formatters tests (8 cases)
npm run test:documents    # documents-command unit tests (2 cases, no DB)
npm run test:e2e          # live end-to-end test (11 assertions)
```

`test:e2e` additionally requires `LANGGRAPH_TEST_ASSISTANT_ID` and a reachable server and database.

## Project layout

```
src/
  cli.ts              entry point, commander wiring
  commands/           one file per command
  api-client.ts       LangGraph REST client
  db-client.ts        PostgreSQL access
  config.ts           env-var resolution (no fallbacks)
  formatters.ts       output formatting
  errors.ts           typed errors
  types.ts            shared types
  utils.ts            misc helpers
docs/
  design/             plans, project design, functional spec
  reference/          API spec, refined request, investigation
test_scripts/         standalone test runners
```

## Project documentation

- `docs/design/project-design.md` — full design.
- `docs/design/project-functions.md` — functional requirements.
- `docs/design/plan-001-lg-tool-implementation.md` — implementation plan.
- `docs/reference/langgraph-server-api-spec.md` — upstream API reference.
- `Issues - Pending Items.md` — open issues and pending work.
