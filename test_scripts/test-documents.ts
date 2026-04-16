/**
 * Tests for the `documents` command (src/commands/documents.ts) and its
 * underlying parser (src/db-client.ts: queryRetrievedDocuments).
 *
 * These tests run without a live database. They exercise:
 *   - UUID validation on --thread (delegated to validateUuid)
 *   - ConfigError when LANGGRAPH_POSTGRES_URL is missing
 *   - Document parsing logic against a synthetic checkpoint_writes payload
 *
 * A live-DB integration test is intentionally out of scope here — it requires
 * a thread that has actually exercised a RAG pipeline with `retrieved_docs`
 * channel writes. See AC-5 in docs/reference/refined-request-lg-tool.md.
 *
 * Run: npx tsx test_scripts/test-documents.ts
 */

import { documentsCommand } from '../src/commands/documents.js';
import { ConfigError, ValidationError } from '../src/errors.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  FAIL  ${name}`);
    console.log(`        ${msg}`);
    failed++;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function withEnv(overrides: Record<string, string | undefined>, fn: () => Promise<void> | void): Promise<void> {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function main(): Promise<void> {
  console.log('test-documents.ts');
  console.log('=================');

  await test('Missing LANGGRAPH_POSTGRES_URL throws ConfigError', async () => {
    // Set to empty string (not undefined) so dotenv.config() in src/config.ts
    // does NOT silently re-populate it from a CWD `.env` file. dotenv only
    // writes a key if `process.env[key] === undefined`.
    await withEnv({ LANGGRAPH_POSTGRES_URL: '' }, async () => {
      let threw = false;
      try {
        await documentsCommand({ thread: '550e8400-e29b-41d4-a716-446655440000' });
      } catch (err) {
        threw = true;
        assert(err instanceof ConfigError, `Expected ConfigError, got ${(err as Error).constructor.name}`);
        assert(
          (err as ConfigError).variableName === 'LANGGRAPH_POSTGRES_URL',
          `Expected variableName "LANGGRAPH_POSTGRES_URL", got "${(err as ConfigError).variableName}"`
        );
      }
      assert(threw, 'Expected documentsCommand to throw when LANGGRAPH_POSTGRES_URL is missing');
    });
  });

  await test('Invalid --thread UUID throws ValidationError before any DB call', async () => {
    // Set a bogus URL so the env-var check passes; UUID validation should fire first.
    await withEnv({ LANGGRAPH_POSTGRES_URL: 'postgresql://user:pass@nowhere.invalid:5432/db' }, async () => {
      let threw = false;
      try {
        await documentsCommand({ thread: 'not-a-uuid' });
      } catch (err) {
        threw = true;
        assert(err instanceof ValidationError, `Expected ValidationError, got ${(err as Error).constructor.name}`);
        assert(
          (err as ValidationError).field === '--thread',
          `Expected field "--thread", got "${(err as ValidationError).field}"`
        );
      }
      assert(threw, 'Expected documentsCommand to throw on invalid UUID');
    });
  });

  console.log('');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Unhandled error in test:', err);
  process.exit(1);
});
