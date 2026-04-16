#!/usr/bin/env node

import { Command } from 'commander';
import { agentsCommand } from './commands/agents.js';
import { threadCreateCommand } from './commands/thread-create.js';
import { runCommand } from './commands/run.js';
import { extractCommand } from './commands/extract.js';
import { documentsCommand } from './commands/documents.js';
import { LgToolError } from './errors.js';

const program = new Command();

program
  .name('lg-tool')
  .description('CLI tool for interacting with LangGraph servers and inspecting their PostgreSQL data')
  .version('1.0.0');

program
  .command('agents')
  .description('List all available agents/assistants')
  .action(async () => {
    await agentsCommand();
  });

program
  .command('thread-create')
  .description('Create a new thread')
  .option('--metadata <json>', 'JSON metadata to attach to the thread')
  .action(async (options) => {
    await threadCreateCommand(options);
  });

program
  .command('run')
  .description('Send a request to an agent')
  .requiredOption('--thread <id>', 'Thread ID (UUID)')
  .requiredOption('--assistant <id>', 'Assistant ID (UUID or graph_id)')
  .requiredOption('--message <text>', 'Message to send to the agent')
  .action(async (options) => {
    await runCommand(options);
  });

program
  .command('extract')
  .description('Extract all thread data from PostgreSQL')
  .requiredOption('--thread <id>', 'Thread ID (UUID)')
  .option('--output <file>', 'Output file path for JSON')
  .option('--include-blobs', 'Include base64-encoded blob data')
  .action(async (options) => {
    await extractCommand(options);
  });

program
  .command('documents')
  .description('Extract retrieved documents used in a thread')
  .requiredOption('--thread <id>', 'Thread ID (UUID)')
  .option('--output <file>', 'Output file path for JSON')
  .action(async (options) => {
    await documentsCommand(options);
  });

// Global error handler
program.parseAsync().catch((error: unknown) => {
  if (error instanceof LgToolError) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
  console.error('Unexpected error:', error);
  process.exit(2);
});
