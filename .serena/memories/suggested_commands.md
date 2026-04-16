# Suggested Commands

## Build & Run
```bash
npm run build              # Compile TypeScript -> dist/ (uses tsc)
npm run typecheck          # Type-check only, no emit
npm run dev                # Run CLI in dev mode (tsx src/cli.ts)
npx tsx src/cli.ts <cmd>   # Equivalent dev invocation with subcommand
```

## Global install (creates the `lg-tool` binary on $PATH)
```bash
npm link                   # Symlinks /opt/homebrew/bin/lg-tool -> dist/cli.js
lg-tool --help             # Verify install
```

If `npm link` fails with EEXIST on `/opt/homebrew/bin/lg-tool`, the prior
symlink is stale (e.g. left over from a folder rename). Remove it and the
stale package link, then re-link:
```bash
rm /opt/homebrew/bin/lg-tool /opt/homebrew/lib/node_modules/<old-name>
npm link
```

## Testing
```bash
npm run test:config        # Unit: config module (no live deps)
npm run test:utils         # Unit: utils + formatters
npm run test:documents     # Unit: documents command (no DB)
npm run test:e2e           # Integration: live LangGraph + Postgres

# Or run any test script directly:
npx tsx test_scripts/test-<name>.ts
```

`test:e2e` requires three env vars: `LANGGRAPH_SERVER_URL`,
`LANGGRAPH_POSTGRES_URL`, and `LANGGRAPH_TEST_ASSISTANT_ID`. The other
test scripts run fully offline.

Tests that simulate "missing env var" must set the variable to `''`
(empty string), NOT `undefined` — otherwise `dotenv.config()` in
`src/config.ts` will silently re-populate the var from the project's
CWD `.env` file.

## Configuration
```bash
# Project-level .env file (gitignored)
./.env

# User-level fallback (loaded if project .env doesn't have the var)
~/.lg-tool/.env

# Shell env vars override both files.
```

## Package Management
```bash
npm install                # Install dependencies from package.json
```

## System Utils (macOS / Darwin defaults)
```bash
git status
ls -la
```
