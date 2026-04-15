# Code Style and Conventions

## Language
- All code must be in TypeScript
- No fallback values for configuration settings - raise exceptions for missing config

## Project Structure
- `docs/design/` - Plans, design docs, configuration guides
- `docs/reference/` - Reference material
- `test_scripts/` - All test scripts
- `prompts/` - Prompt files with sequential numbering
- Plans: `docs/design/plan-NNN-<description>.md`
- Design: `docs/design/project-design.md`
- Functions: `docs/design/project-functions.md`
- Issues: `Issues - Pending Items.md` at project root

## Database Naming
- Table names: singular (e.g., "Customer" not "Customers")
- Junction tables: plural if one-to-many (e.g., "CustomerTransactions")

## Tool Documentation
All tools documented in CLAUDE.md with XML format: toolName > objective, command, info

## Configuration
- Never use fallback/default values for missing config
- Always raise exceptions for missing configuration
