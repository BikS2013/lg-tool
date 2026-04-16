import fs from 'fs/promises';
import { loadDbConfig } from '../config.js';
import { createPool, extractThreadData } from '../db-client.js';
import { validateUuid } from '../utils.js';
import { maskConnectionString } from '../formatters.js';
import { DbError } from '../errors.js';

interface ExtractOptions {
  thread: string;
  output?: string;
  includeBlobs?: boolean;
}

/**
 * Handler for: lg-tool extract --thread <id> [--output <file>] [--include-blobs]
 *
 * 1. Load DB config
 * 2. Validate --thread UUID
 * 3. Create connection pool
 * 4. Run 6 concurrent queries via extractThreadData()
 * 5. Output JSON to stdout or to --output file
 * 6. Close pool
 */
export async function extractCommand(options: ExtractOptions): Promise<void> {
  const config = loadDbConfig();

  validateUuid(options.thread, '--thread');

  const pool = createPool(config.postgresUrl);

  try {
    const extraction = await extractThreadData(
      pool,
      options.thread,
      options.includeBlobs ?? false
    );

    const json = JSON.stringify(extraction, null, 2);

    if (options.output) {
      await fs.writeFile(options.output, json, 'utf-8');
      console.log(`Extraction written to ${options.output}`);
    } else {
      console.log(json);
    }
  } catch (error) {
    if (error instanceof DbError) throw error;
    const err = error as Error;
    throw new DbError(
      `Database error: ${err.message} (connection: ${maskConnectionString(config.postgresUrl)})`,
      err
    );
  } finally {
    await pool.end();
  }
}
