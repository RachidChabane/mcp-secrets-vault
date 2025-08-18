import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
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
      // Build fetch options
      const options: RequestInit = {
        method: request.method,
        headers,
        signal: controller.signal,
        redirect: 'follow'
      };
      
      // Add body for POST requests
      if (request.method === 'POST' && request.body) {
        options.body = JSON.stringify(request.body);
        headers['content-type'] = 'application/json';
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
        statusText: 'Error',
        headers: {},
        error: this.sanitizeError(error)
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
    if (request.injectionType === 'header' && !request.headerName) {
      throw new Error(TEXT.ERROR_INVALID_REQUEST);
    }
  }
  
  /**
   * Inject secret into request headers
   */
  private injectSecret(request: ActionRequest): Record<string, string> {
    const headers: Record<string, string> = {
      ...request.headers,
      'user-agent': CONFIG.HTTP_DEFAULT_USER_AGENT
    };
    
    if (request.injectionType === 'bearer') {
      headers['authorization'] = `Bearer ${request.secretValue}`;
    } else if (request.injectionType === 'header' && request.headerName) {
      headers[request.headerName.toLowerCase()] = request.secretValue;
    }
    
    return headers;
  }
  
  /**
   * Sanitize response before returning
   */
  private async sanitizeResponse(response: Response): Promise<ActionResponse> {
    // Filter allowed headers
    const sanitizedHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (this.allowedHeaders.has(key.toLowerCase())) {
        sanitizedHeaders[key] = this.redactSensitiveValue(value);
      }
    });
    
    // Get and truncate body
    let body: string | undefined;
    try {
      const text = await response.text();
      body = this.truncateAndRedact(text);
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
  
  /**
   * Truncate and redact response body
   */
  private truncateAndRedact(text: string): string {
    // Truncate if too long
    let result = text;
    if (text.length > CONFIG.RESPONSE_MAX_BODY_LENGTH) {
      result = text.substring(0, CONFIG.RESPONSE_MAX_BODY_LENGTH) + 
               CONFIG.RESPONSE_TRUNCATION_MESSAGE;
    }
    
    // Redact sensitive patterns
    return this.redactSensitiveValue(result);
  }
  
  /**
   * Redact sensitive values from strings
   */
  private redactSensitiveValue(value: string): string {
    // Redact URLs with auth
    value = value.replace(
      /https?:\/\/[^:]+:[^@]+@[^\s]+/gi,
      CONFIG.SANITIZE_REPLACEMENT
    );
    
    // Redact key=value patterns with sensitive keys, preserving the key name
    value = value.replace(
      /(api[_-]?key|secret|token|password|auth|bearer)\s*=\s*([^\s]+)/gi,
      (_match, key) => `${key}=${CONFIG.SANITIZE_REPLACEMENT}`
    );
    
    // Redact standalone tokens that look like secrets
    value = value.replace(
      /\b[a-zA-Z0-9_-]{20,}\b/g,
      (match) => {
        // Don't redact if it looks like a regular word or is too short
        if (match.length < 20 || /^[a-zA-Z]+$/.test(match)) {
          return match;
        }
        // Check if it contains both letters and numbers/special chars (likely a token)
        if (/[a-zA-Z]/.test(match) && /[0-9_-]/.test(match)) {
          return CONFIG.SANITIZE_REPLACEMENT;
        }
        return match;
      }
    );
    
    return value;
  }
  
  /**
   * Sanitize error messages
   */
  private sanitizeError(error: unknown): string {
    if (error instanceof Error) {
      // Remove any URLs or sensitive data from error message
      return this.redactSensitiveValue(error.message);
    }
    return TEXT.ERROR_INVALID_REQUEST;
  }
}