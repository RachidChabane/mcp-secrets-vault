import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import {
  sanitizeForOutput,
  sanitizeError,
  sanitizeHeaders,
  isEmptyOrWhitespace
} from '../utils/security.js';
import type { 
  IActionExecutor, 
  ActionRequest, 
  ActionResponse 
} from '../interfaces/action-executor.interface.js';

/**
 * HTTP Action Executor Service
 * Executes HTTP GET and POST requests with secret injection
 */
export class HttpActionExecutor implements IActionExecutor {
  private readonly allowedHeaders: Set<string>;
  
  constructor() {
    this.allowedHeaders = new Set(
      CONFIG.ALLOWED_RESPONSE_HEADERS.map(h => h.toLowerCase())
    );
  }
  
  /**
   * Execute an HTTP action with secret injection
   */
  private buildFetchOptions(request: ActionRequest, headers: Record<string, string>, controller: AbortController): RequestInit {
    const options: RequestInit = {
      method: request.method,
      headers,
      signal: controller.signal,
      redirect: CONFIG.FETCH_REDIRECT_MODE
    };
    if (request.method === 'POST' && request.body) {
      options.body = JSON.stringify(request.body);
      headers[CONFIG.HEADER_CONTENT_TYPE] = CONFIG.CONTENT_TYPE_JSON;
    }
    return options;
  }

  private handleExecutionError(error: unknown): ActionResponse {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        statusCode: 0,
        statusText: TEXT.ERROR_TIMEOUT,
        headers: {},
        error: TEXT.ERROR_TIMEOUT
      };
    }
    return {
      statusCode: 0,
      statusText: TEXT.ERROR_NETWORK_ERROR,
      headers: {},
      error: sanitizeError(error)
    };
  }

  async execute(request: ActionRequest): Promise<ActionResponse> {
    this.validateRequest(request);
    const headers = this.injectSecret(request);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.HTTP_TIMEOUT_MS);
    
    try {
      const options = this.buildFetchOptions(request, headers, controller);
      const response = await fetch(request.url, options);
      return await this.sanitizeResponse(response);
    } catch (error) {
      return this.handleExecutionError(error);
    } finally {
      clearTimeout(timeout);
    }
  }
  
  /**
   * Validate the action request
   */
  private validateRequest(request: ActionRequest): void {
    // Check method
    if (!CONFIG.SUPPORTED_HTTP_METHODS.includes(request.method)) {
      throw new Error(TEXT.ERROR_INVALID_REQUEST);
    }
    
    // Check URL
    try {
      new URL(request.url);
    } catch {
      throw new Error(TEXT.ERROR_INVALID_REQUEST);
    }
    
    // Check injection type
    if (![TEXT.INJECTION_TYPE_HEADER, TEXT.INJECTION_TYPE_BEARER].includes(request.injectionType)) {
      throw new Error(TEXT.ERROR_INVALID_REQUEST);
    }
    
    // Check header name for header injection
    if (request.injectionType === TEXT.INJECTION_TYPE_HEADER) {
      if (isEmptyOrWhitespace(request.headerName)) {
        throw new Error(TEXT.ERROR_EMPTY_HEADER_NAME);
      }
    }
  }
  
  /**
   * Inject secret into request headers
   */
  private injectSecret(request: ActionRequest): Record<string, string> {
    const headers: Record<string, string> = {
      ...request.headers,
      [CONFIG.HEADER_USER_AGENT]: CONFIG.HTTP_DEFAULT_USER_AGENT
    };
    
    if (request.injectionType === 'bearer') {
      headers[TEXT.AUTHORIZATION_HEADER] = `Bearer ${request.secretValue}`;
    } else if (request.injectionType === 'header' && request.headerName) {
      headers[request.headerName.toLowerCase()] = request.secretValue;
    }
    
    return headers;
  }
  
  /**
   * Sanitize response before returning
   */
  private async sanitizeResponse(response: Response): Promise<ActionResponse> {
    // Filter and normalize headers
    const sanitizedHeaders = sanitizeHeaders(response.headers, this.allowedHeaders);
    
    // Get and sanitize body
    let body: string | undefined;
    try {
      const text = await response.text();
      body = sanitizeForOutput(text);
    } catch {
      body = undefined;
    }
    
    return {
      statusCode: response.status,
      statusText: response.statusText,
      headers: sanitizedHeaders,
      body
    };
  }
}