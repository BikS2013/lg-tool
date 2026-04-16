/**
 * End-to-end test for lg-tool.
 *
 * Runs against the LIVE validation server and database.
 * Test flow: list agents -> create thread -> send request -> extract data -> file output -> include blobs
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { searchAssistants, createThread, runAndWait } from '../src/api-client.js';
import { createPool, extractThreadData } from '../src/db-client.js';
import { loadServerConfig, loadDbConfig } from '../src/config.js';
import { UUID_REGEX } from '../src/utils.js';
import type { Pool } from 'pg';
import type { ThreadExtraction } from '../src/types.js';

// ─── Required env vars (must be set in shell or .env) ───
// LANGGRAPH_SERVER_URL    - base URL of the live LangGraph server to test against
// LANGGRAPH_POSTGRES_URL  - Postgres connection string for the LangGraph database
// LANGGRAPH_TEST_ASSISTANT_ID - UUID of an assistant known to exist on that server
//
// Per project rule: configuration must never be defaulted in code. The test loads
// these via loadServerConfig() / loadDbConfig() below; missing values throw ConfigError.
const KNOWN_ASSISTANT_ID =
  process.env.LANGGRAPH_TEST_ASSISTANT_ID ??
  (() => {
    throw new Error(
      'LANGGRAPH_TEST_ASSISTANT_ID env var is required to run the e2e test ' +
        '(UUID of an assistant deployed on LANGGRAPH_SERVER_URL).'
    );
  })();

// ─── Test helpers ───
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.log(`  FAIL: ${message}`);
    failed++;
  }
}

// ─── Main test ───
async function main(): Promise<void> {
  const serverConfig = loadServerConfig();
  const dbConfig = loadDbConfig();
  const serverUrl = serverConfig.serverUrl;
  let pool: Pool | null = null;

  try {
    // ──────────────────────────────────────────
    // Step 1: List agents
    // ──────────────────────────────────────────
    console.log('\n--- Step 1: List agents ---');
    const assistants = await searchAssistants(serverUrl);
    assert(assistants.length >= 1, `At least 1 assistant returned (got ${assistants.length})`);

    const knownAgent = assistants.find(a => a.assistant_id === KNOWN_ASSISTANT_ID);
    assert(knownAgent !== undefined, `Known assistant ${KNOWN_ASSISTANT_ID} exists`);

    // ──────────────────────────────────────────
    // Step 2: Create thread
    // ──────────────────────────────────────────
    console.log('\n--- Step 2: Create thread ---');
    const thread = await createThread(serverUrl);
    const threadId = thread.thread_id;
    assert(UUID_REGEX.test(threadId), `thread_id is valid UUID: ${threadId}`);
    assert(thread.status === 'idle', `Thread status is "idle" (got "${thread.status}")`);

    // ──────────────────────────────────────────
    // Step 3: Send request
    // ──────────────────────────────────────────
    console.log('\n--- Step 3: Send request (may take up to 2 minutes) ---');
    const { result, runId } = await runAndWait(
      serverUrl,
      threadId,
      KNOWN_ASSISTANT_ID,
      'Hello, what can you help me with?'
    );
    assert(
      result.messages !== undefined && Array.isArray(result.messages),
      `Response has messages array (length: ${result.messages?.length ?? 'N/A'})`
    );
    console.log(`  (run_id: ${runId})`);

    // ──────────────────────────────────────────
    // Step 4: Extract data
    // ──────────────────────────────────────────
    console.log('\n--- Step 4: Extract data ---');
    pool = createPool(dbConfig.postgresUrl);
    const extraction: ThreadExtraction = await extractThreadData(pool, threadId, false);

    assert(extraction.thread !== null, 'Thread record is not null');
    assert(
      extraction.thread?.thread_id === threadId,
      `Thread record thread_id matches (${extraction.thread?.thread_id})`
    );
    assert(extraction.runs.length >= 1, `Runs has at least 1 record (got ${extraction.runs.length})`);
    assert(
      extraction.checkpoints.length >= 1,
      `Checkpoints has at least 1 record (got ${extraction.checkpoints.length})`
    );

    // ──────────────────────────────────────────
    // Step 5: File output
    // ──────────────────────────────────────────
    console.log('\n--- Step 5: File output ---');
    const tmpFile = path.join(os.tmpdir(), `langgraph-e2e-${Date.now()}.json`);
    const json = JSON.stringify(extraction, null, 2);
    await fs.writeFile(tmpFile, json, 'utf-8');

    const readBack = await fs.readFile(tmpFile, 'utf-8');
    let parsedOk = false;
    try {
      JSON.parse(readBack);
      parsedOk = true;
    } catch {
      parsedOk = false;
    }
    assert(parsedOk, `Written file is valid JSON (${tmpFile})`);

    // Clean up temp file
    await fs.unlink(tmpFile);
    console.log(`  (temp file cleaned up)`);

    // ──────────────────────────────────────────
    // Step 6: Include blobs
    // ──────────────────────────────────────────
    console.log('\n--- Step 6: Include blobs ---');
    const extractionWithBlobs: ThreadExtraction = await extractThreadData(pool, threadId, true);

    if (extractionWithBlobs.checkpoint_blobs.length > 0) {
      const hasBlobBase64 = extractionWithBlobs.checkpoint_blobs.some(
        (b) => 'blob_base64' in b && b.blob_base64 !== undefined
      );
      assert(
        hasBlobBase64,
        `blob_base64 fields appear in checkpoint_blobs (${extractionWithBlobs.checkpoint_blobs.length} records)`
      );
    } else {
      console.log('  SKIP: No checkpoint_blobs records to verify blob_base64 fields');
    }

  } finally {
    // ─── Cleanup ───
    if (pool) {
      await pool.end();
      console.log('\n  DB pool closed.');
    }
  }

  // ─── Summary ───
  console.log(`\n============================`);
  console.log(`  Total: ${passed + failed}  |  PASS: ${passed}  |  FAIL: ${failed}`);
  console.log(`============================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Unhandled error in test:', err);
  process.exit(1);
});
