import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UseSecretTool } from './use-secret-tool.js';
import { SecretProvider } from '../interfaces/secret-provider.interface.js';
import { SecretAccessor } from '../interfaces/secret-accessor.interface.js';
import { PolicyProviderService } from '../services/policy-provider.service.js';
import { RateLimiterService } from '../services/rate-limiter.service.js';
import type { IActionExecutor } from '../interfaces/action-executor.interface.js';
import { JsonlAuditService } from '../services/audit-service.js';
import type { AuditService } from '../interfaces/audit.interface.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';

vi.mock('../services/audit-service.js');

describe('UseSecretTool', () => {
  let tool: UseSecretTool;
  let mockSecretProvider: SecretProvider & SecretAccessor;
  let mockPolicyProvider: PolicyProviderService;
  let mockActionExecutor: IActionExecutor;
  let mockAuditService: AuditService;
  let mockRateLimiter: RateLimiterService;

  beforeEach(() => {
    mockSecretProvider = {
      listSecretIds: vi.fn(),
      getSecretInfo: vi.fn(),
      isSecretAvailable: vi.fn(),
      getSecretValue: vi.fn()
    } as any;

    mockPolicyProvider = new PolicyProviderService();
    
    mockActionExecutor = {
      execute: vi.fn()
    };

    mockRateLimiter = {
      checkLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 99, resetAt: Date.now() + CONFIG.DEFAULT_RATE_LIMIT_WINDOW_SECONDS * CONFIG.MILLISECONDS_PER_SECOND }),
      reset: vi.fn(),
      resetAll: vi.fn()
    } as any;
    
    tool = new UseSecretTool(
      mockSecretProvider,
      mockPolicyProvider,
      mockActionExecutor,
      mockRateLimiter
    );

    // Access mocked instances
    mockAuditService = (JsonlAuditService as any).mock.instances[0];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getTool', () => {
    it('should return tool definition with correct schema', () => {
      const toolDef = tool.getTool();
      
      expect(toolDef.name).toBe(TEXT.TOOL_USE);
      expect(toolDef.description).toBe(TEXT.TOOL_DESC_USE);
      expect(toolDef.inputSchema).toEqual({
        type: TEXT.SCHEMA_TYPE_OBJECT,
        properties: {
          secretId: {
            type: TEXT.SCHEMA_TYPE_STRING,
            description: TEXT.INPUT_DESC_USE_SECRET_ID
          },
          action: {
            type: TEXT.SCHEMA_TYPE_OBJECT,
            properties: {
              type: {
                type: TEXT.SCHEMA_TYPE_STRING,
                enum: [TEXT.HTTP_METHOD_GET, TEXT.HTTP_METHOD_POST],
                description: TEXT.INPUT_DESC_ACTION_TYPE
              },
              url: {
                type: TEXT.SCHEMA_TYPE_STRING,
                description: TEXT.INPUT_DESC_ACTION_URL
              },
              headers: {
                type: TEXT.SCHEMA_TYPE_OBJECT,
                description: TEXT.INPUT_DESC_ACTION_HEADERS,
                additionalProperties: { type: TEXT.SCHEMA_TYPE_STRING }
              },
              body: {
                type: TEXT.SCHEMA_TYPE_STRING,
                description: TEXT.INPUT_DESC_ACTION_BODY
              },
              injectionType: {
                type: TEXT.SCHEMA_TYPE_STRING,
                enum: [TEXT.INJECTION_TYPE_BEARER, TEXT.INJECTION_TYPE_HEADER],
                description: TEXT.INPUT_DESC_INJECTION_TYPE
              }
            },
            required: ['type', 'url']
          }
        },
        required: ['secretId', 'action']
      });
    });
  });

  describe('execute', () => {
    it('should successfully execute allowed action', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test API key'
      });

      vi.mocked(mockSecretProvider.getSecretValue).mockReturnValue('secret-value-123');

      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: true
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      vi.mocked(mockActionExecutor.execute).mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({ data: 'test' })
      });

      const result = await tool.execute(args);

      expect(result).toEqual({
        success: true,
        result: {
          statusCode: 200,
          statusText: 'OK',
          headers: {},
          body: JSON.stringify({ data: 'test' })
        }
      });

      expect(mockPolicyProvider.evaluate).toHaveBeenCalledWith(
        'TEST_API_KEY',
        'http_get',
        'api.example.com'
      );

      expect(mockAuditService.write).toHaveBeenCalledWith({
        secretId: 'TEST_API_KEY',
        action: 'http_get',
        domain: 'api.example.com',
        timestamp: expect.any(String),
        outcome: TEXT.AUDIT_OUTCOME_SUCCESS,
        reason: TEXT.SUCCESS_REQUEST_COMPLETED
      });

      expect(mockActionExecutor.execute).toHaveBeenCalledWith({
        method: TEXT.HTTP_VERB_GET,
        url: 'https://api.example.com/data',
        headers: {
          [TEXT.AUTHORIZATION_HEADER]: 'Bearer secret-value-123'
        },
        body: undefined,
        secretValue: 'secret-value-123',
        injectionType: 'bearer'
      });
    });

    it('should deny action when policy evaluator denies', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_post',
          url: 'https://forbidden.com/api',
          body: '{"data": "test"}'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test API key'
      });

      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: false,
        message: TEXT.ERROR_FORBIDDEN_DOMAIN,
        code: CONFIG.ERROR_CODE_FORBIDDEN_DOMAIN
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      expect(result.message).toBe(TEXT.ERROR_FORBIDDEN_DOMAIN);
      expect(result.code).toBeDefined();

      expect(mockAuditService.write).toHaveBeenCalledWith({
        secretId: 'TEST_API_KEY',
        action: 'http_post',
        domain: 'forbidden.com',
        timestamp: expect.any(String),
        outcome: TEXT.AUDIT_OUTCOME_DENIED,
        reason: TEXT.ERROR_FORBIDDEN_DOMAIN
      });

      expect(mockActionExecutor.execute).not.toHaveBeenCalled();
    });

    it('should return error for unknown secret', async () => {
      const args = {
        secretId: 'UNKNOWN_SECRET',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue(undefined);

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      expect(result.message).toBe(TEXT.ERROR_UNKNOWN_SECRET);
      expect(result.code).toBe('unknown_secret');
    });

    it('should return error for unavailable secret', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: false,
        description: 'Test API key'
      });

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      expect(result.message).toBe(TEXT.ERROR_UNKNOWN_SECRET);
      expect(result.code).toBe('unknown_secret');
    });

    it('should return error for invalid arguments', async () => {
      const args = {
        secretId: 'TEST_API_KEY'
        // Missing action
      };

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      expect(result.message).toBe(TEXT.ERROR_INVALID_REQUEST);
      expect(result.code).toBe('invalid_request');
    });

    it('should return error for invalid URL', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'not-a-valid-url'
        }
      };

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      expect(result.message).toBe(TEXT.ERROR_INVALID_URL);
      expect(result.code).toBe('invalid_url');
    });

    it('should handle POST request with headers and body', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_post',
          url: 'https://api.example.com/submit',
          headers: {
            'Content-Type': 'application/json',
            'X-Custom-Header': 'custom-value'
          },
          body: '{"key": "value"}'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test API key'
      });

      vi.mocked(mockSecretProvider.getSecretValue).mockReturnValue('secret-value-123');

      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: true
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      vi.mocked(mockActionExecutor.execute).mockResolvedValue({
        statusCode: 201,
        statusText: 'Created',
        headers: {},
        body: JSON.stringify({ success: true })
      });

      const result = await tool.execute(args);

      expect(result).toEqual({
        success: true,
        result: {
          statusCode: 201,
          statusText: 'Created',
          headers: {},
          body: JSON.stringify({ success: true })
        }
      });

      expect(mockActionExecutor.execute).toHaveBeenCalledWith({
        method: TEXT.HTTP_VERB_POST,
        url: 'https://api.example.com/submit',
        headers: {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'custom-value',
          [TEXT.AUTHORIZATION_HEADER]: 'Bearer secret-value-123'
        },
        body: '{"key": "value"}',
        secretValue: 'secret-value-123',
        injectionType: 'bearer'
      });
    });

    it('should trim URL before validation', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: '  https://api.example.com/data  '  // URL with spaces
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test'
      });

      vi.mocked(mockSecretProvider.getSecretValue).mockReturnValue('secret');

      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: true
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      vi.mocked(mockActionExecutor.execute).mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        body: '{}'
      });

      const result = await tool.execute(args);

      expect(result.success).toBe(true);
      expect(mockActionExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/data'  // Trimmed URL
        })
      );
    });
  });

  describe('rate limiting', () => {
    it('should deny request when rate limit exceeded', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      };

      vi.mocked(mockRateLimiter.checkLimit).mockReturnValue({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + CONFIG.DEFAULT_RATE_LIMIT_WINDOW_SECONDS * CONFIG.MILLISECONDS_PER_SECOND
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      expect(result.message).toBe(TEXT.ERROR_RATE_LIMITED);
      expect(result.code).toBe('rate_limited');

      expect(mockAuditService.write).toHaveBeenCalledWith({
        secretId: 'TEST_API_KEY',
        action: 'http_get',
        domain: 'api.example.com',
        timestamp: expect.any(String),
        outcome: TEXT.AUDIT_OUTCOME_DENIED,
        reason: TEXT.ERROR_RATE_LIMITED
      });
    });

    it('should check rate limit with correct key', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test API key'
      });

      await tool.execute(args);

      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('TEST_API_KEY:api.example.com');
    });
  });

  describe('input validation', () => {
    it('should trim input strings', async () => {
      const args = {
        secretId: '  TEST_API_KEY  ',
        action: {
          type: 'http_get',
          url: '  https://api.example.com/data  ',
          headers: {
            '  X-Custom  ': '  value  '
          }
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test'
      });

      vi.mocked(mockSecretProvider.getSecretValue).mockReturnValue('secret');

      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: true
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      vi.mocked(mockActionExecutor.execute).mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        body: '{}'
      });

      await tool.execute(args);

      // Check that trimmed values were used
      expect(mockSecretProvider.getSecretInfo).toHaveBeenCalledWith('TEST_API_KEY');
      expect(mockActionExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/data',
          headers: {
            'X-Custom': 'value',
            [TEXT.AUTHORIZATION_HEADER]: 'Bearer secret'
          }
        })
      );
    });

    it('should audit invalid URL', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'not-a-valid-url'
        }
      };

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      expect(result.message).toBe(TEXT.ERROR_INVALID_URL);
      expect(result.code).toBe('invalid_url');
    });

    it('should support injection type parameter', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_post',
          url: 'https://api.example.com/data',
          injectionType: 'header'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test'
      });

      vi.mocked(mockSecretProvider.getSecretValue).mockReturnValue('secret');

      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: true
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      vi.mocked(mockActionExecutor.execute).mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        body: '{}'
      });

      await tool.execute(args);

      expect(mockActionExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          injectionType: 'header'
        })
      );
    });

    it('should handle invalid action type with specific error', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'DELETE', // Invalid method
          url: 'https://api.example.com/data'
        }
      };

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      expect(result.message).toBe(TEXT.ERROR_INVALID_METHOD);
      expect(result.code).toBe(CONFIG.ERROR_CODE_INVALID_METHOD);
    });

    it('should handle invalid injection type with specific error', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data',
          injectionType: 'custom' // Invalid injection type
        }
      };

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      expect(result.message).toBe(TEXT.ERROR_INVALID_INJECTION_TYPE);
      expect(result.code).toBe(CONFIG.ERROR_CODE_INVALID_INJECTION_TYPE);
    });

    it('should trim action.type before enum validation', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: '  http_get  ', // Action type with spaces
          url: 'https://api.example.com/data'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test'
      });

      vi.mocked(mockSecretProvider.getSecretValue).mockReturnValue('secret');

      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: true
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      vi.mocked(mockActionExecutor.execute).mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        body: '{}'
      });

      const result = await tool.execute(args);

      expect(result.success).toBe(true);
      
      // Verify that the trimmed value was used in execution
      expect(mockActionExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          method: TEXT.HTTP_VERB_GET
        })
      );
    });

    it('should trim injectionType before enum validation', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data',
          injectionType: '  header  ' // Injection type with spaces
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test'
      });

      vi.mocked(mockSecretProvider.getSecretValue).mockReturnValue('secret');

      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: true
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      vi.mocked(mockActionExecutor.execute).mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        body: '{}'
      });

      const result = await tool.execute(args);

      expect(result.success).toBe(true);
      
      // Verify that the trimmed value was used in execution
      expect(mockActionExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          injectionType: 'header'
        })
      );
    });
  });

  describe('audit coverage', () => {
    it('should audit completely invalid request with fallback values', async () => {
      const args = {}; // Missing both secretId and action

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      expect(result.message).toBe(TEXT.ERROR_INVALID_REQUEST);
      expect(result.code).toBe('invalid_request');

      // Should have written audit with fallback values
      expect(mockAuditService.write).toHaveBeenCalledWith({
        secretId: 'unknown',
        action: 'unknown',
        domain: 'unknown',
        timestamp: expect.any(String),
        outcome: TEXT.AUDIT_OUTCOME_DENIED,
        reason: TEXT.ERROR_INVALID_REQUEST
      });
    });

    it('should audit when policyProvider.evaluate throws', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test API key'
      });

      const evaluationError = new Error('Policy evaluation failed');
      mockPolicyProvider.evaluate = vi.fn().mockImplementation(() => {
        throw evaluationError;
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      expect(result.message).toBe(TEXT.ERROR_EXECUTION_FAILED);
      expect(result.code).toBe('execution_failed');

      // Should have written audit for the policy evaluation error
      expect(mockAuditService.write).toHaveBeenCalledWith({
        secretId: 'TEST_API_KEY',
        action: 'http_get',
        domain: 'api.example.com',
        timestamp: expect.any(String),
        outcome: TEXT.AUDIT_OUTCOME_ERROR,
        reason: TEXT.ERROR_EXECUTION_FAILED
      });
    });

    it('should reject empty header names after trimming', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data',
          headers: {
            '   ': 'value'  // Header name that's only whitespace
          }
        }
      };

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      expect(result.message).toBe(TEXT.ERROR_INVALID_HEADERS);
      expect(result.code).toBe('invalid_headers');

      // Should have written audit for invalid request
      expect(mockAuditService.write).toHaveBeenCalledWith({
        secretId: 'TEST_API_KEY',
        action: 'http_get',
        domain: 'unknown',
        timestamp: expect.any(String),
        outcome: TEXT.AUDIT_OUTCOME_DENIED,
        reason: TEXT.ERROR_INVALID_REQUEST
      });
    });


    it('should audit successful execution', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test'
      });

      vi.mocked(mockSecretProvider.getSecretValue).mockReturnValue('secret');

      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: true
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      vi.mocked(mockActionExecutor.execute).mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        body: '{}'
      });

      await tool.execute(args);

      expect(mockAuditService.write).toHaveBeenCalledWith({
        secretId: 'TEST_API_KEY',
        action: 'http_get',
        domain: 'api.example.com',
        timestamp: expect.any(String),
        outcome: TEXT.AUDIT_OUTCOME_SUCCESS,
        reason: TEXT.SUCCESS_REQUEST_COMPLETED
      });
    });

    it('should audit executor errors', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test'
      });

      vi.mocked(mockSecretProvider.getSecretValue).mockReturnValue('secret');

      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: true
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      const executorError = new Error('Network timeout');
      vi.mocked(mockActionExecutor.execute).mockRejectedValue(executorError);

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      
      // Should have written audit for the executor error
      expect(mockAuditService.write).toHaveBeenCalledWith({
        secretId: 'TEST_API_KEY',
        action: 'http_get',
        domain: 'api.example.com',
        timestamp: expect.any(String),
        outcome: TEXT.AUDIT_OUTCOME_ERROR,
        reason: TEXT.ERROR_EXECUTION_FAILED
      });
    });

    it('should audit missing secret value', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test'
      });

      vi.mocked(mockSecretProvider.getSecretValue).mockReturnValue(undefined);

      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: true
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      expect(result.message).toBe(TEXT.ERROR_MISSING_ENV);
      expect(result.code).toBe('missing_env');

      expect(mockAuditService.write).toHaveBeenCalledWith({
        secretId: 'TEST_API_KEY',
        action: 'http_get',
        domain: 'api.example.com',
        timestamp: expect.any(String),
        outcome: TEXT.AUDIT_OUTCOME_ERROR,
        reason: TEXT.ERROR_MISSING_ENV
      });
    });

    it('should return execution_failed code for unexpected errors', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      expect(result.message).toBe(TEXT.ERROR_EXECUTION_FAILED);
      expect(result.code).toBe('execution_failed');
    });

    it('should audit unexpected errors in catch-all path', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      };

      // Mock to throw non-ToolError, non-ZodError
      vi.mocked(mockSecretProvider.getSecretInfo).mockImplementation(() => {
        throw new Error('Unexpected database error');
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      expect(result.message).toBe(TEXT.ERROR_EXECUTION_FAILED);
      expect(result.code).toBe('execution_failed');

      // Verify audit entry was created with error outcome
      expect(mockAuditService.write).toHaveBeenCalledWith({
        secretId: 'TEST_API_KEY',
        action: 'http_get',
        domain: 'api.example.com',
        timestamp: expect.any(String),
        outcome: TEXT.AUDIT_OUTCOME_ERROR,
        reason: TEXT.ERROR_EXECUTION_FAILED
      });
    });

    it('should not write duplicate audit when executor throws error', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test API key'
      });

      vi.mocked(mockSecretProvider.getSecretValue).mockReturnValue('secret');

      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: true
      });

      // Make executor throw an error
      const executorError = new Error('Network request failed');
      vi.mocked(mockActionExecutor.execute).mockRejectedValue(executorError);

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      const result = await tool.execute(args);

      expect(result.success).toBe(false);
      expect(result.message).toBe(TEXT.ERROR_EXECUTION_FAILED);
      expect(result.code).toBe('execution_failed');

      // Should only write one audit entry (from executeSecretAction, not from handleExecutionError)
      expect(mockAuditService.write).toHaveBeenCalledTimes(1);
      expect(mockAuditService.write).toHaveBeenCalledWith({
        secretId: 'TEST_API_KEY',
        action: 'http_get',
        domain: 'api.example.com',
        timestamp: expect.any(String),
        outcome: TEXT.AUDIT_OUTCOME_ERROR,
        reason: TEXT.ERROR_EXECUTION_FAILED
      });
    });
  });
});