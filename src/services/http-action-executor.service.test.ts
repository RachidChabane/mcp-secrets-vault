import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpActionExecutor } from './http-action-executor.service.js';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import type { ActionRequest } from '../interfaces/action-executor.interface.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('HttpActionExecutor', () => {
  let executor: HttpActionExecutor;
  
  beforeEach(() => {
    executor = new HttpActionExecutor();
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('execute', () => {
    describe('GET requests', () => {
      it('should execute GET request with bearer token', async () => {
        const mockResponse = new Response('{"result": "success"}', {
          status: 200,
          statusText: 'OK',
          headers: {
            'content-type': 'application/json',
            'x-request-id': '123'
          }
        });
        mockFetch.mockResolvedValueOnce(mockResponse);
        
        const request: ActionRequest = {
          method: 'GET',
          url: 'https://api.example.com/data',
          secretValue: 'secret123',
          injectionType: 'bearer'
        };
        
        const response = await executor.execute(request);
        
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/data',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              [CONFIG.HEADER_AUTHORIZATION]: 'Bearer secret123',
              [CONFIG.HEADER_USER_AGENT]: CONFIG.HTTP_DEFAULT_USER_AGENT
            }),
            redirect: CONFIG.FETCH_REDIRECT_MODE
          })
        );
        
        expect(response.statusCode).toBe(200);
        expect(response.statusText).toBe('OK');
        expect(response.headers['content-type']).toBe('application/json');
        expect(response.headers['x-request-id']).toBe('123');
        expect(response.body).toBe('{"result": "success"}');
      });
      
      it('should execute GET request with custom header', async () => {
        const mockResponse = new Response('OK', {
          status: 200,
          statusText: 'OK'
        });
        mockFetch.mockResolvedValueOnce(mockResponse);
        
        const request: ActionRequest = {
          method: 'GET',
          url: 'https://api.example.com/data',
          secretValue: 'api-key-123',
          injectionType: 'header',
          headerName: 'X-API-Key'
        };
        
        const response = await executor.execute(request);
        
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/data',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              'x-api-key': 'api-key-123',
              [CONFIG.HEADER_USER_AGENT]: CONFIG.HTTP_DEFAULT_USER_AGENT
            }),
            redirect: CONFIG.FETCH_REDIRECT_MODE
          })
        );
        
        expect(response.statusCode).toBe(200);
        expect(response.body).toBe('OK');
      });
    });
    
    describe('POST requests', () => {
      it('should execute POST request with body and bearer token', async () => {
        const mockResponse = new Response('{"id": 42}', {
          status: 201,
          statusText: 'Created',
          headers: {
            'content-type': 'application/json'
          }
        });
        mockFetch.mockResolvedValueOnce(mockResponse);
        
        const request: ActionRequest = {
          method: 'POST',
          url: 'https://api.example.com/create',
          body: { name: 'test', value: 123 },
          secretValue: 'secret456',
          injectionType: 'bearer'
        };
        
        const response = await executor.execute(request);
        
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/create',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ name: 'test', value: 123 }),
            headers: expect.objectContaining({
              [CONFIG.HEADER_AUTHORIZATION]: 'Bearer secret456',
              [CONFIG.HEADER_CONTENT_TYPE]: 'application/json',
              [CONFIG.HEADER_USER_AGENT]: CONFIG.HTTP_DEFAULT_USER_AGENT
            }),
            redirect: CONFIG.FETCH_REDIRECT_MODE
          })
        );
        
        expect(response.statusCode).toBe(201);
        expect(response.statusText).toBe('Created');
        expect(response.body).toBe('{"id": 42}');
      });
      
      it('should execute POST request with custom headers', async () => {
        const mockResponse = new Response('Success', {
          status: 200,
          statusText: 'OK'
        });
        mockFetch.mockResolvedValueOnce(mockResponse);
        
        const request: ActionRequest = {
          method: 'POST',
          url: 'https://api.example.com/webhook',
          headers: {
            'x-custom-header': 'custom-value'
          },
          secretValue: 'webhook-secret',
          injectionType: 'header',
          headerName: 'X-Webhook-Secret'
        };
        
        const response = await executor.execute(request);
        
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/webhook',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'x-webhook-secret': 'webhook-secret',
              'x-custom-header': 'custom-value',
              [CONFIG.HEADER_USER_AGENT]: CONFIG.HTTP_DEFAULT_USER_AGENT
            }),
            redirect: CONFIG.FETCH_REDIRECT_MODE
          })
        );
        
        expect(response.statusCode).toBe(200);
      });
    });
    
    describe('Response sanitization', () => {
      it('should normalize header keys to lowercase', async () => {
        const mockResponse = new Response('OK', {
          status: 200,
          statusText: 'OK',
          headers: {
            'Content-Type': 'application/json',
            'X-Rate-Limit-Remaining': '50',
            'CACHE-CONTROL': 'no-cache'
          }
        });
        mockFetch.mockResolvedValueOnce(mockResponse);
        
        const request: ActionRequest = {
          method: 'GET',
          url: 'https://api.example.com/data',
          secretValue: 'secret',
          injectionType: 'bearer'
        };
        
        const response = await executor.execute(request);
        
        // All headers should be lowercase
        expect(response.headers).toHaveProperty('content-type');
        expect(response.headers).toHaveProperty('x-rate-limit-remaining');
        expect(response.headers).toHaveProperty('cache-control');
        expect(response.headers).not.toHaveProperty('Content-Type');
        expect(response.headers).not.toHaveProperty('CACHE-CONTROL');
      });
      
      it('should filter out non-allowed headers', async () => {
        const mockResponse = new Response('OK', {
          status: 200,
          statusText: 'OK',
          headers: {
            'content-type': 'text/plain',
            'authorization': 'Bearer secret',
            'x-secret-header': 'sensitive',
            'x-rate-limit-remaining': '99',
            'set-cookie': 'session=abc123'
          }
        });
        mockFetch.mockResolvedValueOnce(mockResponse);
        
        const request: ActionRequest = {
          method: 'GET',
          url: 'https://api.example.com/data',
          secretValue: 'secret',
          injectionType: 'bearer'
        };
        
        const response = await executor.execute(request);
        
        // Should only include allowed headers
        expect(response.headers).toHaveProperty('content-type');
        expect(response.headers).toHaveProperty('x-rate-limit-remaining');
        expect(response.headers).not.toHaveProperty('authorization');
        expect(response.headers).not.toHaveProperty('x-secret-header');
        expect(response.headers).not.toHaveProperty('set-cookie');
      });
      
      it('should truncate long response bodies', async () => {
        const longBody = 'x'.repeat(CONFIG.RESPONSE_MAX_BODY_LENGTH + 100);
        const mockResponse = new Response(longBody, {
          status: 200,
          statusText: 'OK'
        });
        mockFetch.mockResolvedValueOnce(mockResponse);
        
        const request: ActionRequest = {
          method: 'GET',
          url: 'https://api.example.com/data',
          secretValue: 'secret',
          injectionType: 'bearer'
        };
        
        const response = await executor.execute(request);
        
        expect(response.body).toBeDefined();
        expect(response.body!.length).toBeLessThanOrEqual(
          CONFIG.RESPONSE_MAX_BODY_LENGTH + CONFIG.RESPONSE_TRUNCATION_MESSAGE.length
        );
        expect(response.body).toContain(CONFIG.RESPONSE_TRUNCATION_MESSAGE);
      });
      
      it('should redact sensitive data from response body', async () => {
        const sensitiveBody = JSON.stringify({
          data: 'result',
          apiKey: 'sk-1234567890abcdef1234567890abcdef',
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0',
          url: 'https://user:password@example.com/path'
        });
        
        const mockResponse = new Response(sensitiveBody, {
          status: 200,
          statusText: 'OK'
        });
        mockFetch.mockResolvedValueOnce(mockResponse);
        
        const request: ActionRequest = {
          method: 'GET',
          url: 'https://api.example.com/data',
          secretValue: 'secret',
          injectionType: 'bearer'
        };
        
        const response = await executor.execute(request);
        
        expect(response.body).toBeDefined();
        expect(response.body).toContain(CONFIG.SANITIZE_REPLACEMENT);
        expect(response.body).not.toContain('sk-1234567890abcdef1234567890abcdef');
        expect(response.body).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
        expect(response.body).not.toContain('user:password@');
      });
    });
    
    describe('Error handling', () => {
      it('should handle timeout errors', async () => {
        // Create a mock AbortController
        const abortError = new Error('Aborted');
        abortError.name = 'AbortError';
        
        // Mock fetch to reject with abort error
        mockFetch.mockRejectedValueOnce(abortError);
        
        const request: ActionRequest = {
          method: 'GET',
          url: 'https://api.example.com/slow',
          secretValue: 'secret',
          injectionType: 'bearer'
        };
        
        const response = await executor.execute(request);
        
        expect(response.statusCode).toBe(0);
        expect(response.statusText).toBe(TEXT.ERROR_TIMEOUT);
        expect(response.error).toBe(TEXT.ERROR_TIMEOUT);
      });
      
      it('should handle network errors', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));
        
        const request: ActionRequest = {
          method: 'GET',
          url: 'https://api.example.com/data',
          secretValue: 'secret',
          injectionType: 'bearer'
        };
        
        const response = await executor.execute(request);
        
        expect(response.statusCode).toBe(0);
        expect(response.statusText).toBe(TEXT.ERROR_NETWORK_ERROR);
        expect(response.error).toBeDefined();
        expect(response.error).not.toContain('secret');
      });
      
      it('should handle invalid URLs', async () => {
        const request: ActionRequest = {
          method: 'GET',
          url: 'not-a-valid-url',
          secretValue: 'secret',
          injectionType: 'bearer'
        };
        
        await expect(executor.execute(request)).rejects.toThrow(TEXT.ERROR_INVALID_REQUEST);
      });
      
      it('should handle unsupported methods', async () => {
        const request: ActionRequest = {
          method: 'DELETE' as any,
          url: 'https://api.example.com/data',
          secretValue: 'secret',
          injectionType: 'bearer'
        };
        
        await expect(executor.execute(request)).rejects.toThrow(TEXT.ERROR_INVALID_REQUEST);
      });
      
      it('should handle invalid injection types', async () => {
        const request: ActionRequest = {
          method: 'GET',
          url: 'https://api.example.com/data',
          secretValue: 'secret',
          injectionType: 'invalid' as any
        };
        
        await expect(executor.execute(request)).rejects.toThrow(TEXT.ERROR_INVALID_REQUEST);
      });
      
      it('should handle missing header name for header injection', async () => {
        const request: ActionRequest = {
          method: 'GET',
          url: 'https://api.example.com/data',
          secretValue: 'secret',
          injectionType: 'header'
        };
        
        await expect(executor.execute(request)).rejects.toThrow(TEXT.ERROR_EMPTY_HEADER_NAME);
      });
      
      it('should handle empty header name for header injection', async () => {
        const request: ActionRequest = {
          method: 'GET',
          url: 'https://api.example.com/data',
          secretValue: 'secret',
          injectionType: 'header',
          headerName: '   '
        };
        
        await expect(executor.execute(request)).rejects.toThrow(TEXT.ERROR_EMPTY_HEADER_NAME);
      });
    });
    
    describe('HTTP status codes', () => {
      it.each([
        [400, 'Bad Request'],
        [401, 'Unauthorized'],
        [403, 'Forbidden'],
        [404, 'Not Found'],
        [429, 'Too Many Requests'],
        [500, 'Internal Server Error'],
        [502, 'Bad Gateway'],
        [503, 'Service Unavailable']
      ])('should handle %i %s response', async (statusCode, statusText) => {
        const mockResponse = new Response('Error occurred', {
          status: statusCode,
          statusText
        });
        mockFetch.mockResolvedValueOnce(mockResponse);
        
        const request: ActionRequest = {
          method: 'GET',
          url: 'https://api.example.com/data',
          secretValue: 'secret',
          injectionType: 'bearer'
        };
        
        const response = await executor.execute(request);
        
        expect(response.statusCode).toBe(statusCode);
        expect(response.statusText).toBe(statusText);
        expect(response.body).toBe('Error occurred');
      });
    });
    
    describe('Redirect safety', () => {
      it('should not follow redirects', async () => {
        const mockResponse = new Response(null, {
          status: 302,
          statusText: 'Found',
          headers: {
            'location': 'https://evil.com/steal'
          }
        });
        mockFetch.mockResolvedValueOnce(mockResponse);
        
        const request: ActionRequest = {
          method: 'GET',
          url: 'https://api.example.com/data',
          secretValue: 'secret123',
          injectionType: 'bearer'
        };
        
        const response = await executor.execute(request);
        
        // Should return the redirect response, not follow it
        expect(response.statusCode).toBe(302);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/data',
          expect.objectContaining({
            redirect: 'manual'
          })
        );
      });
      
      it('should handle redirect responses without following', async () => {
        const mockResponse = new Response('Redirecting...', {
          status: 301,
          statusText: 'Moved Permanently',
          headers: {
            'location': 'https://different-domain.com/resource'
          }
        });
        mockFetch.mockResolvedValueOnce(mockResponse);
        
        const request: ActionRequest = {
          method: 'POST',
          url: 'https://api.example.com/submit',
          body: { data: 'test' },
          secretValue: 'api-key-456',
          injectionType: 'header',
          headerName: 'X-API-Key'
        };
        
        const response = await executor.execute(request);
        
        expect(response.statusCode).toBe(301);
        expect(response.body).toBe('Redirecting...');
        // Verify fetch was only called once (no follow)
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });
    
    describe('Security', () => {
      it('should never expose secret values in responses', async () => {
        const secretValue = 'supersecretapikey12345678901234567890';  // 36 chars, matches pattern
        const mockResponse = new Response(
          `Error: Invalid API key ${secretValue}`,
          {
            status: 401,
            statusText: 'Unauthorized'
          }
        );
        mockFetch.mockResolvedValueOnce(mockResponse);
        
        const request: ActionRequest = {
          method: 'GET',
          url: 'https://api.example.com/data',
          secretValue,
          injectionType: 'bearer'
        };
        
        const response = await executor.execute(request);
        
        expect(response.body).toBeDefined();
        expect(response.body).not.toContain(secretValue);
        expect(response.body).toContain(CONFIG.SANITIZE_REPLACEMENT);
      });
      
      it('should redact authorization headers in response headers', async () => {
        const mockResponse = new Response('OK', {
          status: 200,
          statusText: 'OK',
          headers: {
            'content-type': 'text/plain',
            'x-rate-limit-remaining': 'Bearer sometoken123456789012345678901234567890'
          }
        });
        mockFetch.mockResolvedValueOnce(mockResponse);
        
        const request: ActionRequest = {
          method: 'GET',
          url: 'https://api.example.com/data',
          secretValue: 'secret',
          injectionType: 'bearer'
        };
        
        const response = await executor.execute(request);
        
        expect(response.headers['x-rate-limit-remaining']).toContain(CONFIG.SANITIZE_REPLACEMENT);
        expect(response.headers['x-rate-limit-remaining']).not.toContain('sometoken123456789012345678901234567890');
      });
      
      it('should sanitize error messages', async () => {
        const errorMessage = 'Connection failed: api_key=secret123 is invalid';
        mockFetch.mockRejectedValueOnce(new Error(errorMessage));
        
        const request: ActionRequest = {
          method: 'GET',
          url: 'https://api.example.com/data',
          secretValue: 'secret',
          injectionType: 'bearer'
        };
        
        const response = await executor.execute(request);
        
        expect(response.error).toBeDefined();
        expect(response.error).not.toContain('secret123');
        expect(response.error).toContain('api_key=' + CONFIG.SANITIZE_REPLACEMENT);
      });
    });
  });
});