/**
 * Request to execute an action with a secret
 */
export interface ActionRequest {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  secretValue: string;
  injectionType: 'header' | 'bearer';
  headerName?: string; // For header injection
}

/**
 * Sanitized response from action execution
 */
export interface ActionResponse {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body?: string;
  error?: string;
}

/**
 * Interface for executing actions with secrets
 */
export interface IActionExecutor {
  /**
   * Execute an HTTP action with the provided secret
   * @param request The action request with secret
   * @returns Sanitized response
   */
  execute(request: ActionRequest): Promise<ActionResponse>;
}