import { Assistant, Thread, RunResult, ApiRequestOptions } from './types.js';
import { ApiError } from './errors.js';

// ─── Constants ───

const DEFAULT_TIMEOUT_MS = 30_000;     // 30 seconds for standard endpoints
const RUN_WAIT_TIMEOUT_MS = 300_000;   // 5 minutes for /runs/wait

// ─── Generic API Request ───

/**
 * Generic HTTP request function for the LangGraph REST API.
 *
 * Uses native fetch with AbortController for timeout enforcement.
 * All requests send and expect JSON. Non-2xx responses throw ApiError.
 *
 * @param serverUrl - Base URL of the LangGraph server (no trailing slash)
 * @param path - API path (e.g., "/assistants/search")
 * @param options - HTTP method, optional body, optional timeout
 * @returns Parsed JSON response typed as T
 * @throws ApiError on non-2xx response
 * @throws ApiError on network/timeout error (wrapped with status 0)
 */
export async function apiRequest<T>(
  serverUrl: string,
  path: string,
  options: ApiRequestOptions
): Promise<T> {
  const url = `${serverUrl}${path}`;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method,
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ApiError(url, response.status, text);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(url, 0, `Request timed out after ${timeoutMs}ms`);
    }
    // Network errors (ECONNREFUSED, DNS failures, etc.)
    throw new ApiError(url, 0, `Network error: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// ─── Specialized API Functions ───

/**
 * List all available assistants/agents on the LangGraph server.
 *
 * Endpoint: POST /assistants/search
 * Body: { "limit": 100 }
 */
export async function searchAssistants(serverUrl: string): Promise<Assistant[]> {
  return apiRequest<Assistant[]>(serverUrl, '/assistants/search', {
    method: 'POST',
    body: { limit: 100 },
  });
}

/**
 * Create a new thread on the LangGraph server.
 *
 * Endpoint: POST /threads
 * Body: { "metadata": {...} } (metadata is optional)
 */
export async function createThread(
  serverUrl: string,
  metadata?: Record<string, unknown>
): Promise<Thread> {
  const body: Record<string, unknown> = {};
  if (metadata) {
    body.metadata = metadata;
  }
  return apiRequest<Thread>(serverUrl, '/threads', {
    method: 'POST',
    body,
  });
}

/**
 * Send a message to an agent within a thread and wait for completion.
 *
 * Endpoint: POST /threads/{threadId}/runs/wait
 * Body: { "assistant_id": "...", "input": { "messages": [{ "role": "human", "content": "..." }] } }
 *
 * This endpoint blocks until the agent run completes.
 * Uses a 300-second timeout to accommodate long-running agents and Azure proxy limits.
 *
 * Note: The /runs/wait endpoint returns the final thread state (including messages),
 * not a Run object. The run_id must be extracted from the response headers or
 * from a subsequent query. If the response includes a top-level object with
 * run metadata, extract run_id from there. Otherwise, query
 * GET /threads/{threadId}/runs after completion to get the run_id.
 *
 * @returns An object containing the RunResult and the run_id
 */
export async function runAndWait(
  serverUrl: string,
  threadId: string,
  assistantId: string,
  message: string
): Promise<{ result: RunResult; runId: string }> {
  const result = await apiRequest<RunResult>(
    serverUrl,
    `/threads/${threadId}/runs/wait`,
    {
      method: 'POST',
      body: {
        assistant_id: assistantId,
        input: {
          messages: [{ role: 'human', content: message }],
        },
      },
      timeoutMs: RUN_WAIT_TIMEOUT_MS,
    }
  );

  // Attempt to extract run_id from the last AI message metadata
  // or fall back to querying the runs list
  let runId = 'unknown';

  // Strategy: query the runs endpoint to get the latest run_id
  try {
    const runs = await apiRequest<Array<{ run_id: string }>>(
      serverUrl,
      `/threads/${threadId}/runs`,
      { method: 'GET' }
    );
    if (runs.length > 0) {
      // Runs are typically returned newest-first
      runId = runs[0].run_id;
    }
  } catch {
    // Non-critical: run_id is informational
  }

  return { result, runId };
}
