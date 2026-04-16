import { loadServerConfig } from '../config.js';
import { runAndWait } from '../api-client.js';
import { formatRunResult } from '../formatters.js';
import { validateUuid } from '../utils.js';

interface RunOptions {
  thread: string;
  assistant: string;
  message: string;
}

/**
 * Handler for: lg-tool run --thread <id> --assistant <id> --message <text>
 *
 * 1. Load server config
 * 2. Validate --thread UUID (--assistant can be UUID or graph_id)
 * 3. Print "Waiting for agent response..." since /runs/wait blocks
 * 4. Call POST /threads/{id}/runs/wait
 * 5. Print agent response and run_id
 */
export async function runCommand(options: RunOptions): Promise<void> {
  const config = loadServerConfig();

  // Validate thread UUID (required to be UUID)
  validateUuid(options.thread, '--thread');

  // Note: --assistant accepts UUID or graph_id, so we do NOT validate it as UUID.
  // The API will reject invalid values with a descriptive error.

  console.log('Waiting for agent response...');

  const { result, runId } = await runAndWait(
    config.serverUrl,
    options.thread,
    options.assistant,
    options.message
  );

  console.log(formatRunResult(result, runId));
}
