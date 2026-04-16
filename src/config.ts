import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import { ServerConfig, DbConfig } from './types.js';
import { ConfigError } from './errors.js';

/**
 * Load .env files in priority order.
 * dotenv.config() does NOT overwrite existing env vars,
 * so env vars set in the shell always take precedence.
 *
 * Load order:
 *   1. process.env (already set, highest priority)
 *   2. .env in current working directory
 *   3. ~/.lg-tool/.env
 */
function loadEnvFiles(): void {
  dotenv.config({ path: path.join(process.cwd(), '.env') });
  dotenv.config({ path: path.join(os.homedir(), '.lg-tool', '.env') });
}

/**
 * Load server configuration. Requires LANGGRAPH_SERVER_URL.
 * Does NOT require LANGGRAPH_POSTGRES_URL.
 *
 * @throws ConfigError if LANGGRAPH_SERVER_URL is not set
 */
export function loadServerConfig(): ServerConfig {
  loadEnvFiles();

  const serverUrl = process.env.LANGGRAPH_SERVER_URL;
  if (!serverUrl) {
    throw new ConfigError('LANGGRAPH_SERVER_URL');
  }

  // Remove trailing slash for consistent URL construction
  return { serverUrl: serverUrl.replace(/\/+$/, '') };
}

/**
 * Load database configuration. Requires LANGGRAPH_POSTGRES_URL.
 * Does NOT require LANGGRAPH_SERVER_URL.
 *
 * @throws ConfigError if LANGGRAPH_POSTGRES_URL is not set
 */
export function loadDbConfig(): DbConfig {
  loadEnvFiles();

  const postgresUrl = process.env.LANGGRAPH_POSTGRES_URL;
  if (!postgresUrl) {
    throw new ConfigError('LANGGRAPH_POSTGRES_URL');
  }

  return { postgresUrl };
}
