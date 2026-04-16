/**
 * Base error class for lg-tool.
 * All custom errors extend this.
 */
export class LgToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LgToolError';
  }
}

/**
 * Thrown when a required configuration variable is missing.
 * Never catches or provides fallback. Exits the CLI immediately.
 */
export class ConfigError extends LgToolError {
  public readonly variableName: string;

  constructor(variableName: string) {
    super(`${variableName} environment variable is required`);
    this.name = 'ConfigError';
    this.variableName = variableName;
  }
}

/**
 * Thrown on HTTP errors from the LangGraph REST API.
 * Includes status code and response body for debugging.
 */
export class ApiError extends LgToolError {
  public readonly statusCode: number;
  public readonly responseBody: string;
  public readonly url: string;

  constructor(url: string, statusCode: number, responseBody: string) {
    super(`API error ${statusCode} from ${url}: ${responseBody}`);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.url = url;
  }
}

/**
 * Thrown on PostgreSQL connection or query errors.
 * The message MUST NOT contain credentials. Use maskConnectionString()
 * before including any connection URL in the message.
 */
export class DbError extends LgToolError {
  public readonly originalError: Error;
  public readonly table?: string;

  constructor(message: string, originalError: Error, table?: string) {
    super(message);
    this.name = 'DbError';
    this.originalError = originalError;
    this.table = table;
  }
}

/**
 * Thrown when user input fails validation (e.g., invalid UUID, malformed JSON).
 */
export class ValidationError extends LgToolError {
  public readonly field: string;
  public readonly value: string;

  constructor(field: string, value: string, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}
