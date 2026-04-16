# Issues - Pending Items

## Pending Items

_No pending items at this time._

---

## Completed Items

### [2026-04-16] Repository Consolidation: merged from `sofia-test`

After comparing this repo against the sibling `sofia-test` repo (same scope, smaller and less mature), the decision was made to keep `langgraph-investigator` as the primary repository. The following migrations and fixes were applied:

- **Migrated reference material from sofia-test**:
  - `docs/reference/langgraph-server-api-spec.md` — full LangGraph Platform REST API reference (~1,200 lines, dated April 2026), including the `X-Api-Key` auth scheme that may be needed for hosted deployments.
  - `docs/reference/samples/thread-69d46eea-extract.json` — real captured Sofia/NBG (Greek banking) thread extract; useful as a regression fixture for the `extract` and `documents` commands.
- **Removed hardcoded production credentials** from `test_scripts/test-e2e.ts:18-22`. The Azure Postgres URL with embedded password (`postgresql://directusersadmin:…@direct-users-postgres.postgres.database.azure.com…`) and the live server URL were replaced with strict env-var reads (`LANGGRAPH_SERVER_URL`, `LANGGRAPH_POSTGRES_URL`, `LANGGRAPH_TEST_ASSISTANT_ID`). The leaked password should be rotated on the Azure Postgres instance.
- **Registered `documents` command as FR-5** in `docs/design/project-functions.md` (was implemented in code but missing from the functional requirements doc).
- **Fixed naming inconsistency** in `CLAUDE.md`: configuration priority list now shows `~/.langgraph-investigator/.env` (matches `src/config.ts:17-20`) instead of the stale `~/.lagent-cli/.env`.

### [2026-04-15] Code Review - Phase 7

Full code review of all 11 source files completed. Findings:

- **TypeScript compilation**: Clean pass (`tsc --noEmit` and `tsc` both succeed with zero errors)
- **CLI help**: Displays correctly with all four commands and their options
- **Design alignment**: All source files match the project design document exactly (file structure, exports, interfaces, error classes, SQL queries, API endpoints)
- **Type safety**: Strict mode enabled; all interfaces well-defined; `as const` column keys in formatters correct
- **Configuration**: No fallback values anywhere; `ConfigError` thrown on all missing env vars
- **SQL injection**: All 8 SQL queries use `$1` parameterized syntax; zero string interpolation
- **Credential masking**: `maskConnectionString()` applied in all DB error paths; `DbError` doc comments enforce masking discipline
- **Error handling**: Four-class hierarchy used correctly; global catch differentiates known vs unknown errors with appropriate exit codes
- **Import paths**: All use `.js` extensions as required by NodeNext module resolution
- **Security**: No credential leaks, no command injection, no SQL injection vectors found
- **dist/ output**: Shebang line present; all `.js` and `.d.ts` files emitted correctly

No bugs or issues requiring fixes were found.
