# LangGraph Investigator

## Purpose
A TypeScript CLI tool that interacts with a LangGraph server and its backing PostgreSQL database. It provides operations to:
- List available agents on the server
- Create threads
- Send requests to agents within thread contexts
- Extract thread-related data (entries, runs, checkpoints, documents) directly from PostgreSQL

## Tech Stack
- **Language**: TypeScript (strict requirement from project conventions)
- **Runtime**: Node.js
- **Package Manager**: npm
- **Target**: CLI tool
- **External Services**: LangGraph Server (REST API), PostgreSQL database

## Project Status
Greenfield project - no existing code yet.

## Key URLs (development/testing)
- LangGraph Server: Azure-hosted web app
- PostgreSQL: Azure-hosted PostgreSQL database
