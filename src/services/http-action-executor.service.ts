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
  async execute(request: ActionRequest): Promise<ActionResponse> {
    // Validate request
    this.validateRequest(request);
    
    // Inject secret into headers
    const headers = this.injectSecret(request);
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      CONFIG.HTTP_TIMEOUT_MS
    );
    
    try {
      // Build fetch options with no redirect following
      const options: RequestInit = {
        method: request.method,
        headers,
        signal: controller.signal,
        redirect: CONFIG.FETCH_REDIRECT_MODE
      };
      
      // Add body for POST requests
      if (request.method === 'POST' && request.body) {
        options.body = JSON.stringify(request.body);
        headers[CONFIG.HEADER_CONTENT_TYPE] = 'application/json';
      }
      
      // Execute request
      const response = await fetch(request.url, options);
      
      // Sanitize and return response
      return await this.sanitizeResponse(response);
      
    } catch (error) {
      // Handle timeout and other errors
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            statusCode: 0,
            statusText: TEXT.ERROR_TIMEOUT,
            headers: {},
            error: TEXT.ERROR_TIMEOUT
          };
        }
      }
      
      // Generic error response
      return {
        statusCode: 0,
        statusText: TEXT.ERROR_NETWORK_ERROR,
        headers: {},
        error: sanitizeError(error)
      };
      
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
    if (!['header', 'bearer'].includes(request.injectionType)) {
      throw new Error(TEXT.ERROR_INVALID_REQUEST);
    }
    
    // Check header name for header injection
    if (request.injectionType === 'header') {
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
      headers[CONFIG.HEADER_AUTHORIZATION] = `Bearer ${request.secretValue}`;
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