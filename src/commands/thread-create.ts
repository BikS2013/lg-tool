import { loadServerConfig } from '../config.js';
import { createThread } from '../api-client.js';
import { formatThreadResult } from '../formatters.js';
import { ValidationError } from '../errors.js';

interface ThreadCreateOptions {
  metadata?: string;  // Raw JSON string from CLI
}

/**
 * Handler for: langgraph-investigator thread-create [--metadata <json>]
 *
 * 1. Load server config
 * 2. Parse --metadata JSON (if provided)
 * 3. Call POST /threads
 * 4. Print thread details
 */
export async function threadCreateCommand(options: ThreadCreateOptions): Promise<void> {
  const config = loadServerConfig();

  let metadata: Record<string, unknown> | undefined;
  if (options.metadata) {
    try {
      metadata = JSON.parse(options.metadata);
    } catch {
      throw new ValidationError(
        '--metadata',
        options.metadata,
        `Invalid JSON for --metadata: "${options.metadata}"`
      );
    }
  }

  const thread = await createThread(config.serverUrl, metadata);
  console.log(formatThreadResult(thread));
}
