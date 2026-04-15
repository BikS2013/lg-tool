// ─── Configuration Types ───

export interface ServerConfig {
  serverUrl: string;  // LANGGRAPH_SERVER_URL, no trailing slash
}

export interface DbConfig {
  postgresUrl: string;  // LANGGRAPH_POSTGRES_URL, full connection string
}

// ─── LangGraph API Types ───

export interface Assistant {
  assistant_id: string;     // UUID
  graph_id: string;         // e.g. "agent"
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;       // ISO 8601 datetime
  updated_at: string;       // ISO 8601 datetime
  version: number;          // integer
  name: string;             // display name
  description: string | null;
}

export interface Thread {
  thread_id: string;        // UUID
  created_at: string;       // ISO 8601 datetime
  updated_at: string;       // ISO 8601 datetime
  metadata: Record<string, unknown>;
  status: 'idle' | 'busy' | 'interrupted' | 'error';
  config: Record<string, unknown>;
  values: Record<string, unknown>;
}

export interface Message {
  role?: 'human' | 'ai' | 'system' | 'tool';
  type?: 'human' | 'ai' | 'system' | 'tool';
  content: string;
  id?: string;
  name?: string;
  tool_calls?: unknown[];
  additional_kwargs?: Record<string, unknown>;
  response_metadata?: Record<string, unknown>;
}

export interface RunResult {
  messages: Message[];
  [key: string]: unknown;   // Additional state fields returned by the agent
}

// ─── API Client Types ───

export interface ApiRequestOptions {
  method: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
}

// ─── Database Record Types ───

export interface ThreadRecord {
  thread_id: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
  status: string;
  config: Record<string, unknown> | null;
  values: Record<string, unknown> | null;
  interrupts: Record<string, unknown> | null;
  error: string | null;       // base64 if bytea, null otherwise
  state_updated_at: string | null;
}

export interface RunRecord {
  run_id: string;
  thread_id: string;
  assistant_id: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
  status: string;
  kwargs: Record<string, unknown> | null;
  multitask_strategy: string | null;
}

export interface CheckpointRecord {
  thread_id: string;
  checkpoint_id: string;
  run_id: string | null;
  parent_checkpoint_id: string | null;
  checkpoint: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  checkpoint_ns: string;
}

export interface CheckpointBlobRecord {
  thread_id: string;
  channel: string;
  version: string;
  type: string;
  blob_size: number;          // from length(blob)
  checkpoint_ns: string;
  blob_base64?: string;       // only present when --include-blobs
}

export interface CheckpointWriteRecord {
  thread_id: string;
  checkpoint_id: string;
  task_id: string;
  idx: number;
  channel: string;
  type: string;
  blob_size: number;          // from length(blob)
  checkpoint_ns: string;
  blob_base64?: string;       // only present when --include-blobs
}

export interface StoreRecord {
  [key: string]: unknown;     // Schema may vary
}

// ─── Retrieved Document Type ───

export interface RetrievedDocument {
  title: string;
  original_title: string;
  link: string;
  content_preview: string;
}

// ─── Extract Result Type ───

export interface ThreadExtraction {
  thread_id: string;
  extracted_at: string;       // ISO 8601 datetime
  thread: ThreadRecord | null;
  runs: RunRecord[];
  checkpoints: CheckpointRecord[];
  checkpoint_blobs: CheckpointBlobRecord[];
  checkpoint_writes: CheckpointWriteRecord[];
  store: StoreRecord[];
}
