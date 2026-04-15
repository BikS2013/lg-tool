import { Assistant, Thread, RunResult, Message } from './types.js';

/**
 * Format assistants into a readable terminal table.
 * Uses fixed-width columns aligned for terminal output.
 *
 * Columns: assistant_id | graph_id | name | description | version | created_at | updated_at
 *
 * Implementation approach:
 *   1. Define column headers and max widths
 *   2. Calculate actual widths from data (min of max-width and longest value)
 *   3. Pad each cell with spaces
 *   4. Join with ' | ' separator
 *   5. Add header underline row
 */
export function formatAgentsTable(assistants: Assistant[]): string {
  if (assistants.length === 0) {
    return 'No assistants found.';
  }

  const columns = [
    { key: 'assistant_id' as const, header: 'ASSISTANT_ID', width: 36 },
    { key: 'graph_id' as const, header: 'GRAPH_ID', width: 20 },
    { key: 'name' as const, header: 'NAME', width: 20 },
    { key: 'description' as const, header: 'DESCRIPTION', width: 30 },
    { key: 'version' as const, header: 'VERSION', width: 7 },
    { key: 'created_at' as const, header: 'CREATED_AT', width: 24 },
    { key: 'updated_at' as const, header: 'UPDATED_AT', width: 24 },
  ];

  const headerLine = columns.map(c => c.header.padEnd(c.width)).join(' | ');
  const separatorLine = columns.map(c => '-'.repeat(c.width)).join('-+-');

  const dataLines = assistants.map(a => {
    return columns.map(c => {
      const val = String(a[c.key] ?? '');
      return val.length > c.width ? val.substring(0, c.width - 3) + '...' : val.padEnd(c.width);
    }).join(' | ');
  });

  return [headerLine, separatorLine, ...dataLines].join('\n');
}

/**
 * Format thread creation result for display.
 */
export function formatThreadResult(thread: Thread): string {
  const lines = [
    `Thread created successfully.`,
    `  thread_id:  ${thread.thread_id}`,
    `  status:     ${thread.status}`,
    `  created_at: ${thread.created_at}`,
    `  metadata:   ${JSON.stringify(thread.metadata)}`,
  ];
  return lines.join('\n');
}

/**
 * Format run result for display.
 * Extracts the last AI message from the messages array.
 *
 * @param result - The RunResult from the /runs/wait endpoint
 * @param runId - Extracted from response headers or the run state
 */
export function formatRunResult(result: RunResult, runId: string): string {
  const lines: string[] = [];

  lines.push(`Run completed.`);
  lines.push(`  run_id: ${runId}`);
  lines.push('');

  // Extract AI messages from the result
  // LangGraph uses "type" field (e.g., "ai"), while the design assumed "role"
  if (result.messages && Array.isArray(result.messages)) {
    const getRole = (m: Message): string => m.type ?? m.role ?? 'unknown';
    const aiMessages = result.messages.filter((m: Message) => getRole(m) === 'ai');
    if (aiMessages.length > 0) {
      lines.push('Agent Response:');
      for (const msg of aiMessages) {
        lines.push(`  [${getRole(msg)}] ${msg.content}`);
      }
    } else {
      lines.push('No AI messages in response.');
    }
  } else {
    lines.push('Response state:');
    lines.push(JSON.stringify(result, null, 2));
  }

  return lines.join('\n');
}

/**
 * Mask credentials in a PostgreSQL connection string.
 * Replaces the password portion with '***'.
 *
 * Input:  postgresql://user:secretpass@host:5432/db?sslmode=require
 * Output: postgresql://user:***@host:5432/db?sslmode=require
 *
 * If the URL cannot be parsed, returns '***masked***' to prevent any leakage.
 */
export function maskConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '***masked***';
  }
}
