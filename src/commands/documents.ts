import fs from 'fs/promises';
import { loadDbConfig } from '../config.js';
import { createPool, queryRetrievedDocuments } from '../db-client.js';
import { validateUuid } from '../utils.js';
import { maskConnectionString } from '../formatters.js';
import { DbError } from '../errors.js';

interface DocumentsOptions {
  thread: string;
  output?: string;
}

/**
 * Handler for: lg-tool documents --thread <id> [--output <file>]
 *
 * Connects to the PostgreSQL database and extracts the retrieved documents
 * used in a thread's RAG pipeline. Documents are parsed from the 'retrieved_docs'
 * channel in checkpoint_writes, which contains <document> XML-like blocks
 * with title, original_title, link, and content.
 */
export async function documentsCommand(options: DocumentsOptions): Promise<void> {
  const config = loadDbConfig();

  validateUuid(options.thread, '--thread');

  const pool = createPool(config.postgresUrl);

  try {
    const documents = await queryRetrievedDocuments(pool, options.thread);

    if (documents.length === 0) {
      console.log('No retrieved documents found for this thread.');
      return;
    }

    const result = {
      thread_id: options.thread,
      extracted_at: new Date().toISOString(),
      document_count: documents.length,
      documents,
    };

    if (options.output) {
      const json = JSON.stringify(result, null, 2);
      await fs.writeFile(options.output, json, 'utf-8');
      console.log(`${documents.length} documents extracted to ${options.output}`);
    } else {
      // Display as formatted table to stdout
      console.log(`Found ${documents.length} retrieved documents for thread ${options.thread}:\n`);
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        console.log(`  ${i + 1}. ${doc.title}`);
        if (doc.link) {
          console.log(`     link: ${doc.link}`);
        }
        if (doc.original_title) {
          console.log(`     original_title: ${doc.original_title}`);
        }
        // Show first line of content as preview
        const firstLine = doc.content_preview.split('\n')[0].trim();
        if (firstLine) {
          console.log(`     preview: ${firstLine.substring(0, 100)}${firstLine.length > 100 ? '...' : ''}`);
        }
        console.log('');
      }
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
