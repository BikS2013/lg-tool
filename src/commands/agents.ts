import { loadServerConfig } from '../config.js';
import { searchAssistants } from '../api-client.js';
import { formatAgentsTable } from '../formatters.js';

/**
 * Handler for: lg-tool agents
 *
 * 1. Load server config (throws if LANGGRAPH_SERVER_URL not set)
 * 2. Call POST /assistants/search with limit 100
 * 3. Format results as terminal table
 * 4. Print to stdout
 */
export async function agentsCommand(): Promise<void> {
  const config = loadServerConfig();
  const assistants = await searchAssistants(config.serverUrl);
  console.log(formatAgentsTable(assistants));
}
