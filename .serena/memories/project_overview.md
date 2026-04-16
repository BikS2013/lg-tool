# lg-tool

## Purpose
A TypeScript CLI tool that interacts with a LangGraph server and its backing PostgreSQL database. It provides five operations:
- List available agents on the server (`agents`)
- Create threads (`thread-create`)
- Send requests to agents within thread contexts (`run`)
- Extract all thread-related data (thread, runs, checkpoints, blobs, writes, store) directly from PostgreSQL (`extract`)
- Extract the documents retrieved by a thread's RAG pipeline from the `retrieved_docs` channel writes (`documents`)

## Tech Stack
- **Language**: TypeScript (strict requirement from project conventions)
- **Runtime**: Node.js >= 18
- **Package Manager**: npm
- **Target**: CLI tool (binary `lg-tool`, installed via `npm link`)
- **External Services**: LangGraph Server (REST API), PostgreSQL database

## Project Status
Implemented and in use. Code, tests, and docs are all in place. Project folder was renamed from `langgraph-investigator` to `lg-tool` on 2026-04-17; the global `npm link` symlink and base error class (`LgToolError`) were updated accordingly.

## Key URLs (development/testing)
- LangGraph Server: Azure-hosted web app (configured via `LANGGRAPH_SERVER_URL`)
- PostgreSQL: Azure-hosted PostgreSQL database (configured via `LANGGRAPH_POSTGRES_URL`)
- `LANGGRAPH_TEST_ASSISTANT_ID` is required only by the e2e test (UUID of a known assistant on the server)
