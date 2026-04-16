# Issues - Pending Items

## Pending Items

### [CRITICAL] Rotate the Azure PostgreSQL password leaked in earlier commits

The original password for the `directusersadmin` Azure PostgreSQL user was committed in plaintext to:
- `test_scripts/test-e2e.ts` (removed on 2026-04-16)
- `docs/design/plan-001-lg-tool-implementation.md` and `docs/reference/refined-request-lg-tool.md` (redacted on 2026-04-17)

The current working tree no longer contains the password, but it remains in git history of any clone made before today. Rotate the password on the Azure PostgreSQL instance and update local `.env` files (`./.env` and `~/.lg-tool/.env`). Until rotated, this credential must be considered compromised.

---

## Completed Items

### [2026-04-17] Folder rename + post-rename audit (seven passes)

**Pass 7 — small accuracy fixes:**
- `Issues - Pending Items.md`: removed stray space in `./. env` → `./.env` in the CRITICAL pending item.
- `docs/design/project-functions.md` NFR-3: added a bullet describing the `documents` command's dual output (numbered list to stdout, pretty JSON when `--output` is supplied).
- `docs/design/project-design.md` Section 2.6 (`api-client.ts` snippet) and the actual `src/api-client.ts:22` JSDoc: changed `@throws LgToolError on network/timeout error` to `@throws ApiError on network/timeout error (wrapped with status 0)`. The function always throws `ApiError` specifically (which extends `LgToolError`), so the more precise type is more useful to callers.

### [2026-04-17] Folder rename + post-rename audit (six passes)

**Pass 6 — Section 1/9/10 catch-up after the new test file:**
- `docs/design/project-design.md` Section 1 file-structure tree: added `test-documents.ts` (no live DB) under `test_scripts/`.
- `docs/design/project-design.md` Section 1 totals: "Total test files" 3 → 4; "Total project files" 18 → 19.
- `docs/design/project-design.md` Section 9: added a `test_scripts/test-documents.ts` subsection with a 2-row test table and a note explaining why no live-DB integration test exists for the documents command (would require a thread that exercised a RAG pipeline; covered by AC-5 instead).
- `docs/design/project-design.md` Section 10 Security Considerations item 2: corrected "All 6 SQL queries use $1" to "All 9 SQL constants use $1" and enumerated all nine (`SQL_THREAD`, `SQL_RUNS`, `SQL_CHECKPOINTS`, `SQL_CHECKPOINT_BLOBS_META`, `SQL_CHECKPOINT_BLOBS_FULL`, `SQL_CHECKPOINT_WRITES_META`, `SQL_CHECKPOINT_WRITES_FULL`, `SQL_STORE`, `SQL_RETRIEVED_DOCS`).

### [2026-04-17] Folder rename + post-rename audit (five passes)

**Pass 5 — design-doc snippet completeness:**
- `docs/design/project-design.md` Section 2.5 (`formatters.ts` snippet): `formatRunResult` updated to use the `getRole(m)` helper (`m.type ?? m.role ?? 'unknown'`) instead of the stale `m.role === 'ai'` filter. Now matches `src/formatters.ts:75–80` and is consistent with the `Message` shape documented in Section 2.1.
- `docs/design/project-design.md` Section 2.7 (`db-client.ts` snippet): added the full `queryRetrievedDocuments` function body (regex parse over base64-decoded blob, builds `RetrievedDocument[]`), so all eight exported functions are now shown in full like the rest of the file.
- `docs/design/project-design.md` Section 2.12 (`commands/documents.ts`): added the full TypeScript code snippet alongside the prose Behavior list, matching the format of sections 2.8–2.11.
- `docs/design/project-design.md` Section 7 (Database Schema): added a one-paragraph callout that the `documents` command reuses the `checkpoint_writes` table (filtered to `channel = 'retrieved_docs'`) and introduces no new tables.

### [2026-04-17] Folder rename + post-rename audit (four passes)

**Pass 4 — design-doc/code drift fixes + housekeeping:**
- `docs/design/project-design.md` Section 2.1 (`types.ts` snippet): `Message` interface now matches the actual code — both `role` and `type` are optional (LangGraph responses use `type`; REST request format uses `role`); added `response_metadata?` field; comment explains the `m.type ?? m.role` consumer pattern. Added the missing `RetrievedDocument` interface (FR-5).
- `docs/design/project-design.md` Section 2.7 (`db-client.ts` snippet): exports list now includes `queryRetrievedDocuments(...)`; type-import line includes `RetrievedDocument`; added the `SQL_RETRIEVED_DOCS` constant; added an "FR-5 query notes" subsection covering the regex parsing strategy and empty-result behavior.
- `docs/design/project-design.md` Section 8 (`package.json` snippet): scripts block now includes `test:documents`.
- `/Users/giorgosmarinos/aiwork/coding-platform/macbook-desktop/CLAUDE.md` (parent): LgTool tests list now includes `test_scripts/test-documents.ts` and notes the `LANGGRAPH_TEST_ASSISTANT_ID` env-var requirement for e2e.
- `.serena/memories/suggested_commands.md`: rewritten from generic boilerplate to project-specific commands — `npm run build/dev/typecheck`, `npm link` (with stale-symlink recovery steps), all four `npm run test:*` targets, env-var setup pointers, and the empty-string-vs-undefined gotcha for tests that simulate "missing env vars".
- `.gitignore`: removed the legacy `src/**/*.js` rule (rootDir is `src`, outDir is `dist`, so no `.js` files appear in `src/` at any point).

### [2026-04-17] Folder rename + post-rename audit (three passes)

**Pass 3 — small consistency fixes + new test coverage:**
- `docs/design/project-design.md`: env-var table now lists `documents` alongside `extract` for `LANGGRAPH_POSTGRES_URL`; Section 6 Commander Program Structure tree adds the `documents` branch; Section 6 Output Formats table adds a row for `documents`; Section 5 now includes a "Documents Command" data-flow note (single query + dual output mode).
- `docs/reference/refined-request-lg-tool.md`: added AC-5 (acceptance criteria for the `documents` command); the previous AC-5 (E2E validation) renumbered to AC-6 with an added optional `documents` check.
- `docs/reference/investigation-lg-tool.md`: added a Snapshot disclaimer at the top so future readers understand the "four commands" / "four REST calls" language reflects pre-FR-5 investigation, not the current state. The body is intentionally left as a historical artifact.
- `.env.example`: comment for `LANGGRAPH_POSTGRES_URL` now says "extract, documents commands"; added `LANGGRAPH_TEST_ASSISTANT_ID` as a documented (e2e-only) variable.
- New file `test_scripts/test-documents.ts` (2 unit tests, no live DB required): asserts (a) `documentsCommand` throws `ConfigError` when `LANGGRAPH_POSTGRES_URL` is missing, (b) `documentsCommand` throws `ValidationError` on a non-UUID `--thread` before any DB call. Added `test:documents` npm script.
- **Pre-existing bug surfaced and fixed in `test_scripts/test-config.ts`**: tests 1 and 2 were passing `LANGGRAPH_*: undefined` to `withEnv`. Because `src/config.ts` calls `dotenv.config()` on each load, and dotenv only writes a key when `process.env[key] === undefined`, deleting the var let the project's CWD `.env` re-populate it — the `ConfigError` then never fired. Tests now pass `''` (empty string) instead, which dotenv refuses to overwrite while `loadServerConfig`/`loadDbConfig` still treat falsy as "missing". Same pattern is documented inline in both test files and in `CLAUDE.md`.
- Updated `CLAUDE.md` test section with the new file, the `test-documents` row, and a note about the empty-string convention.

### [2026-04-17] Folder rename + post-rename audit (two passes)

Renamed the project folder from `langgraph-investigator` to `lg-tool`. Follow-up fixes applied across two audit passes:

**Pass 1 — code/config rename and primary doc updates:**
- Removed the stale global symlink `/opt/homebrew/bin/lg-tool` (pointed at the old `langgraph-investigator/dist/cli.js`) and the stale `/opt/homebrew/lib/node_modules/langgraph-investigator` package link, then re-ran `npm link` so `lg-tool` resolves to `lg-tool/dist/cli.js`.
- Renamed the base error class `InvestigatorError` -> `LgToolError` in `src/errors.ts`, with matching updates in `src/cli.ts`, `src/api-client.ts` JSDoc, and all `docs/design/project-design.md` snippets. Subclasses (`ConfigError`, `ApiError`, `DbError`, `ValidationError`) now extend `LgToolError`.
- Updated `docs/design/project-design.md`: overview now lists 5 operations (added FR-5 documents); file structure tree includes `src/commands/documents.ts`, `langgraph-server-api-spec.md`, and `samples/`; source-file count corrected to 13; added section 2.12 covering the documents command; CLI snippet now registers the `documents` subcommand.
- Updated `.serena/memories/project_overview.md`: removed the "greenfield" note, listed all 5 commands, and recorded the folder rename.

**Pass 2 — credential redaction, plan/reference doc sync, and count corrections:**
- Redacted the leaked Azure PostgreSQL connection string (`directusersadmin` user, password, hostname, db name) and the production server URL `nbg-webapp-cc-lg-test-we-dev-02-fthxhdbcegbredh3.westeurope-01.azurewebsites.net` from `docs/design/plan-001-lg-tool-implementation.md` and `docs/reference/refined-request-lg-tool.md`. Replaced with placeholders (`<langgraph-server-host>`, `<db-user>`, `<redacted>`, `<db-host>`, `<db-name>`). Also redacted the production assistant UUID `fe096781-…` -> `<assistant-uuid>` from both files and from the test-design tables in `project-design.md`.
- The Azure password remains exposed in git history of any pre-2026-04-17 clone — see the new pending item above for the rotation requirement.
- Synced `docs/design/plan-001-lg-tool-implementation.md` to FR-5: Phase 1 acceptance now references "five subcommands"; Phase 4 lists `src/commands/documents.ts`, describes the `documents` handler, and adds two new acceptance criteria; Phase 4 verification commands include the `documents` examples; Phase 6 test description matches what `test_scripts/test-e2e.ts` actually asserts (no more phantom checks for `checkpoint_blobs`/`checkpoint_writes` row counts or run_id cross-checks); Phase 6 verification commands now include `LANGGRAPH_TEST_ASSISTANT_ID`; file-creation summary lists `documents.ts`; "Total new files" updated 16 -> 17; Phase 4 effort table now says "Five command handlers".
- Synced `docs/reference/refined-request-lg-tool.md` to FR-5: summary now reads "five core operations"; objectives list a 5th item; new FR-5 section added; CLI Interface Summary lists the `documents` command.
- Corrected `docs/design/project-design.md` Section 9: removed the phantom "Env var overrides .env file" row from the test-config table (only 5 cases exist); test-utils table now uses a placeholder UUID; test-e2e narrative trimmed to match the 11 actual `assert()` calls and now requires `LANGGRAPH_TEST_ASSISTANT_ID`.
- Restored `CLAUDE.md` test counts to (5 cases / 8 cases / 11 assertions), correcting an earlier mistake where I'd swapped them with raw `assert()` totals (10 / 23 / 12) without distinguishing test wrappers from inner assertions.

Note on the 2026-04-16 entry below: the path it mentions (`~/.langgraph-investigator/.env`) is now `~/.lg-tool/.env` after the rename. `src/config.ts:19` reflects the current path.

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
