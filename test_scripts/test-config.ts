/**
 * Tests for the configuration module (src/config.ts).
 *
 * Validates:
 *   - Missing LANGGRAPH_SERVER_URL throws ConfigError
 *   - Missing LANGGRAPH_POSTGRES_URL throws ConfigError
 *   - loadServerConfig does not require POSTGRES_URL
 *   - loadDbConfig does not require SERVER_URL
 *   - Trailing slash is stripped from server URL
 *
 * Run: npx tsx test_scripts/test-config.ts
 */

import { loadServerConfig, loadDbConfig } from '../src/config.js';
import { ConfigError } from '../src/errors.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
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

// Helper to save and restore environment variables around each test
function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
  }
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

console.log('test-config.ts');
console.log('==============');

// ── Test 1: Missing LANGGRAPH_SERVER_URL throws ConfigError ──
// NOTE: env vars are set to '' (not undefined) so that dotenv.config() in
// src/config.ts does NOT silently re-populate them from a CWD `.env` file.
// dotenv writes a key only when `process.env[key] === undefined`.
test('Missing LANGGRAPH_SERVER_URL throws ConfigError', () => {
  withEnv({ LANGGRAPH_SERVER_URL: '', LANGGRAPH_POSTGRES_URL: '' }, () => {
    let threw = false;
    try {
      loadServerConfig();
    } catch (err) {
      threw = true;
      assert(err instanceof ConfigError, `Expected ConfigError, got ${(err as Error).constructor.name}`);
      assert(
        (err as ConfigError).variableName === 'LANGGRAPH_SERVER_URL',
        `Expected variableName "LANGGRAPH_SERVER_URL", got "${(err as ConfigError).variableName}"`
      );
    }
    assert(threw, 'Expected loadServerConfig to throw when LANGGRAPH_SERVER_URL is missing');
  });
});

// ── Test 2: Missing LANGGRAPH_POSTGRES_URL throws ConfigError ──
test('Missing LANGGRAPH_POSTGRES_URL throws ConfigError', () => {
  withEnv({ LANGGRAPH_SERVER_URL: '', LANGGRAPH_POSTGRES_URL: '' }, () => {
    let threw = false;
    try {
      loadDbConfig();
    } catch (err) {
      threw = true;
      assert(err instanceof ConfigError, `Expected ConfigError, got ${(err as Error).constructor.name}`);
      assert(
        (err as ConfigError).variableName === 'LANGGRAPH_POSTGRES_URL',
        `Expected variableName "LANGGRAPH_POSTGRES_URL", got "${(err as ConfigError).variableName}"`
      );
    }
    assert(threw, 'Expected loadDbConfig to throw when LANGGRAPH_POSTGRES_URL is missing');
  });
});

// ── Test 3: loadServerConfig does not require POSTGRES_URL ──
test('loadServerConfig does not require LANGGRAPH_POSTGRES_URL', () => {
  withEnv({ LANGGRAPH_SERVER_URL: 'http://localhost:8000', LANGGRAPH_POSTGRES_URL: '' }, () => {
    const config = loadServerConfig();
    assert(config.serverUrl === 'http://localhost:8000', `Unexpected serverUrl: ${config.serverUrl}`);
  });
});

// ── Test 4: loadDbConfig does not require SERVER_URL ──
test('loadDbConfig does not require LANGGRAPH_SERVER_URL', () => {
  withEnv({ LANGGRAPH_SERVER_URL: '', LANGGRAPH_POSTGRES_URL: 'postgresql://user:pass@host:5432/db' }, () => {
    const config = loadDbConfig();
    assert(
      config.postgresUrl === 'postgresql://user:pass@host:5432/db',
      `Unexpected postgresUrl: ${config.postgresUrl}`
    );
  });
});

// ── Test 5: Trailing slash is stripped from server URL ──
test('Trailing slash is stripped from server URL', () => {
  withEnv({ LANGGRAPH_SERVER_URL: 'http://localhost:8000///', LANGGRAPH_POSTGRES_URL: '' }, () => {
    const config = loadServerConfig();
    assert(config.serverUrl === 'http://localhost:8000', `Expected no trailing slash, got: ${config.serverUrl}`);
  });
});

console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
