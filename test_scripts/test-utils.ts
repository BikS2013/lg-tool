/**
 * Tests for utils (src/utils.ts) and formatters (src/formatters.ts).
 *
 * Validates:
 *   - validateUuid accepts a valid UUID
 *   - validateUuid rejects invalid UUID (throws ValidationError)
 *   - validateUuid rejects empty string
 *   - maskConnectionString masks password
 *   - maskConnectionString handles no password
 *   - maskConnectionString handles invalid URL (returns "***masked***")
 *   - formatAgentsTable with data produces table with headers
 *   - formatAgentsTable with empty array returns "No assistants found."
 *
 * Run: npx tsx test_scripts/test-utils.ts
 */

import { validateUuid } from '../src/utils.js';
import { ValidationError } from '../src/errors.js';
import { maskConnectionString, formatAgentsTable } from '../src/formatters.js';
import { Assistant } from '../src/types.js';

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

console.log('test-utils.ts');
console.log('=============');

// ── validateUuid tests ──

test('Valid UUID accepted by validateUuid', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000';
  const result = validateUuid(uuid, '--thread');
  assert(result === uuid, `Expected "${uuid}", got "${result}"`);
});

test('Invalid UUID rejected (throws ValidationError)', () => {
  let threw = false;
  try {
    validateUuid('not-a-uuid', '--thread');
  } catch (err) {
    threw = true;
    assert(err instanceof ValidationError, `Expected ValidationError, got ${(err as Error).constructor.name}`);
    assert((err as ValidationError).field === '--thread', `Expected field "--thread", got "${(err as ValidationError).field}"`);
  }
  assert(threw, 'Expected validateUuid to throw for invalid UUID');
});

test('Empty string rejected by validateUuid', () => {
  let threw = false;
  try {
    validateUuid('', '--thread');
  } catch (err) {
    threw = true;
    assert(err instanceof ValidationError, `Expected ValidationError, got ${(err as Error).constructor.name}`);
  }
  assert(threw, 'Expected validateUuid to throw for empty string');
});

// ── maskConnectionString tests ──

test('maskConnectionString masks password', () => {
  const masked = maskConnectionString('postgresql://user:secretpass@host:5432/db?sslmode=require');
  assert(masked.includes('***'), `Expected masked output to contain "***", got: ${masked}`);
  assert(!masked.includes('secretpass'), `Password "secretpass" should be masked, got: ${masked}`);
  assert(masked.includes('user'), `Username should be preserved, got: ${masked}`);
  assert(masked.includes('host'), `Host should be preserved, got: ${masked}`);
});

test('maskConnectionString handles no password', () => {
  const masked = maskConnectionString('postgresql://user@host:5432/db');
  assert(masked.includes('user'), `Username should be preserved, got: ${masked}`);
  assert(masked.includes('host'), `Host should be preserved, got: ${masked}`);
});

test('maskConnectionString handles invalid URL (returns "***masked***")', () => {
  const masked = maskConnectionString('this is not a url at all');
  assert(masked === '***masked***', `Expected "***masked***", got: "${masked}"`);
});

// ── formatAgentsTable tests ──

test('formatAgentsTable with data produces table with headers', () => {
  const assistants: Assistant[] = [
    {
      assistant_id: '550e8400-e29b-41d4-a716-446655440000',
      graph_id: 'agent',
      config: {},
      metadata: {},
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      version: 1,
      name: 'Test Agent',
      description: 'A test agent',
    },
  ];

  const table = formatAgentsTable(assistants);
  assert(table.includes('ASSISTANT_ID'), `Table should contain "ASSISTANT_ID" header, got: ${table}`);
  assert(table.includes('GRAPH_ID'), `Table should contain "GRAPH_ID" header`);
  assert(table.includes('NAME'), `Table should contain "NAME" header`);
  assert(table.includes('VERSION'), `Table should contain "VERSION" header`);
  assert(table.includes('550e8400'), `Table should contain the assistant ID`);
  assert(table.includes('Test Agent'), `Table should contain the agent name`);

  // Check that there is a separator line
  const lines = table.split('\n');
  assert(lines.length >= 3, `Expected at least 3 lines (header, separator, data), got ${lines.length}`);
  assert(lines[1].includes('-'), `Second line should be a separator with dashes`);
});

test('formatAgentsTable with empty array returns "No assistants found."', () => {
  const result = formatAgentsTable([]);
  assert(result === 'No assistants found.', `Expected "No assistants found.", got: "${result}"`);
});

console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
