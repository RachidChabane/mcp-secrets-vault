import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { DiscoverTool } from '../tools/discover-tool.js';
import { DescribePolicyTool } from '../tools/describe-policy-tool.js';
import { UseSecretTool } from '../tools/use-secret-tool.js';
import { QueryAuditTool } from '../tools/query-audit-tool.js';
import { EnvSecretProvider } from '../services/env-secret-provider.js';
import { PolicyProviderService } from '../services/policy-provider.service.js';
import { HttpActionExecutor } from '../services/http-action-executor.service.js';
import { RateLimiterService } from '../services/rate-limiter.service.js';
import { JsonlAuditService } from '../services/audit-service.js';
import { ToolError } from '../utils/errors.js';

describe('MCP Payload Snapshots', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let secretProvider: EnvSecretProvider;
  let policyProvider: PolicyProviderService;
  let actionExecutor: HttpActionExecutor;
  let rateLimiter: RateLimiterService;
  let auditService: JsonlAuditService;
  let testAuditDir: string;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    
    // Create unique temporary directory for audit logs
    testAuditDir = path.join(os.tmpdir(), `snapshot-audit-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testAuditDir, { recursive: true });
    
    // Set up test environment
    process.env['TEST_API_KEY'] = 'test-secret-value';
    process.env['TEST_DB_PASS'] = 'db-secret-value';
    
    secretProvider = new EnvSecretProvider([
      {
        secretId: 'test_api_key',
        envVar: 'TEST_API_KEY',
        description: 'Test API Key'
      },
      {
        secretId: 'test_db_pass',
        envVar: 'TEST_DB_PASS',
        description: 'Test Database Password'
      }
    ]);
    
    policyProvider = new PolicyProviderService();
    actionExecutor = new HttpActionExecutor();
    rateLimiter = new RateLimiterService();
    auditService = new JsonlAuditService(testAuditDir);
  });

  afterEach(async () => {
    process.env = originalEnv;
    
    // Clean up audit service and temporary directory
    if (auditService) {
      await auditService.close();
    }
    
    if (testAuditDir) {
      try {
        await fs.rm(testAuditDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('Tool Metadata Snapshots', () => {
    it('should match snapshot for discover tool metadata', () => {
      const discoverTool = new DiscoverTool(secretProvider);
      const toolDef = discoverTool.getTool();
      
      expect(toolDef).toMatchInlineSnapshot(`
        {
          "description": "List all available secret identifiers and their metadata",
          "inputSchema": {
            "properties": {},
            "required": [],
            "type": "object",
          },
          "name": "discover_secrets",
        }
      `);
    });

    it('should match snapshot for describe policy tool metadata', () => {
      const describePolicyTool = new DescribePolicyTool(policyProvider);
      const toolDef = describePolicyTool.getTool();
      
      expect(toolDef).toMatchInlineSnapshot(`
        {
          "description": "Get policy details for a secret",
          "inputSchema": {
            "properties": {
              "secretId": {
                "description": "The ID of the secret to describe policy for",
                "type": "string",
              },
            },
            "required": [
              "secretId",
            ],
            "type": "object",
          },
          "name": "describe_policy",
        }
      `);
    });

    it('should match snapshot for use secret tool metadata', () => {
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter, auditService);
      const toolDef = useSecretTool.getTool();
      
      expect(toolDef).toMatchInlineSnapshot(`
        {
          "description": "Use a secret to perform an action",
          "inputSchema": {
            "properties": {
              "action": {
                "properties": {
                  "body": {
                    "description": "Optional body for POST requests",
                    "type": "string",
                  },
                  "headers": {
                    "additionalProperties": {
                      "type": "string",
                    },
                    "description": "Optional headers for the request",
                    "type": "object",
                  },
                  "injectionType": {
                    "description": "How to inject the secret (bearer or header)",
                    "enum": [
                      "bearer",
                      "header",
                    ],
                    "type": "string",
                  },
                  "type": {
                    "description": "The type of action to perform",
                    "enum": [
                      "http_get",
                      "http_post",
                    ],
                    "type": "string",
                  },
                  "url": {
                    "description": "The URL to make the request to",
                    "type": "string",
                  },
                },
                "required": [
                  "type",
                  "url",
                ],
                "type": "object",
              },
              "secretId": {
                "description": "The ID of the secret to use",
                "type": "string",
              },
            },
            "required": [
              "secretId",
              "action",
            ],
            "type": "object",
          },
          "name": "use_secret",
        }
      `);
    });

    it('should match snapshot for query audit tool metadata', () => {
      const queryAuditTool = new QueryAuditTool(auditService);
      const toolDef = queryAuditTool.getTool();
      
      expect(toolDef).toMatchInlineSnapshot(`
        {
          "description": "Query audit log entries with filtering and pagination",
          "inputSchema": {
            "properties": {
              "endTime": {
                "description": "End time for filtering (ISO 8601 format)",
                "type": "string",
              },
              "outcome": {
                "description": "Filter by outcome",
                "enum": [
                  "success",
                  "denied",
                  "error",
                ],
                "type": "string",
              },
              "page": {
                "description": "Page number (starts at 1)",
                "type": "number",
              },
              "pageSize": {
                "description": "Number of entries per page (max 500)",
                "type": "number",
              },
              "secretId": {
                "description": "Filter by secret identifier",
                "type": "string",
              },
              "startTime": {
                "description": "Start time for filtering (ISO 8601 format)",
                "type": "string",
              },
            },
            "required": [],
            "type": "object",
          },
          "name": "query_audit",
        }
      `);
    });
  });

  describe('Successful Execution Snapshots', () => {
    it('should match snapshot for discover tool response', async () => {
      const discoverTool = new DiscoverTool(secretProvider);
      const result = await discoverTool.execute({});
      
      expect(result).toMatchInlineSnapshot(`
        {
          "secrets": [
            {
              "available": true,
              "description": "Test API Key",
              "secretId": "test_api_key",
            },
            {
              "available": true,
              "description": "Test Database Password",
              "secretId": "test_db_pass",
            },
          ],
        }
      `);
    });

    it('should match snapshot for describe policy response', async () => {
      vi.spyOn(policyProvider, 'getPolicy').mockReturnValue({
        secretId: 'test_api_key',
        allowedActions: ['http_get', 'http_post'],
        allowedDomains: ['api.example.com', 'api.test.com'],
        rateLimit: {
          requests: 100,
          windowSeconds: 3600
        },
        expiresAt: '2025-12-31T23:59:59Z'
      });
      
      const describePolicyTool = new DescribePolicyTool(policyProvider);
      const result = await describePolicyTool.execute({
        [TEXT.FIELD_SECRET_ID]: 'test_api_key'
      });
      
      expect(result).toMatchInlineSnapshot(`
        {
          "allowedActions": [
            "http_get",
            "http_post",
          ],
          "allowedDomains": [
            "api.example.com",
            "api.test.com",
          ],
          "expiresAt": "2025-12-31T23:59:59Z",
          "rateLimit": {
            "requests": 100,
            "windowSeconds": 3600,
          },
          "secretId": "test_api_key",
        }
      `);
    });

    it('should match snapshot for query audit response', async () => {
      await auditService.initialize();
      
      // Add some test audit entries (with specific timestamps to ensure predictable order)
      await auditService.write({
        timestamp: '2024-01-01T10:00:00.000Z',
        secretId: 'test_api_key',
        action: 'http_get',
        outcome: 'success',
        reason: 'Request completed successfully'
      });
      
      await auditService.write({
        timestamp: '2024-01-01T11:00:00.000Z',
        secretId: 'test_db_pass',
        action: 'http_post',
        outcome: 'denied',
        reason: 'Domain not allowed'
      });
      
      const queryAuditTool = new QueryAuditTool(auditService);
      const result = await queryAuditTool.execute({});
      
      // Normalize timestamps for snapshot
      const normalizedResult = {
        ...result,
        [TEXT.FIELD_ENTRIES]: result[TEXT.FIELD_ENTRIES].map((entry: any) => ({
          ...entry,
          [TEXT.FIELD_TIMESTAMP]: '2024-01-01T00:00:00.000Z'
        }))
      };
      
      expect(normalizedResult).toMatchInlineSnapshot(`
        {
          "entries": [
            {
              "action": "http_post",
              "outcome": "denied",
              "reason": "Domain not allowed",
              "secretId": "test_db_pass",
              "timestamp": "2024-01-01T00:00:00.000Z",
            },
            {
              "action": "http_get",
              "outcome": "success",
              "reason": "Request completed successfully",
              "secretId": "test_api_key",
              "timestamp": "2024-01-01T00:00:00.000Z",
            },
          ],
          "hasMore": false,
          "page": 1,
          "pageSize": 50,
          "totalCount": 2,
        }
      `);
    });
  });

  describe('Error Response Snapshots', () => {
    it('should match snapshot for missing secret error', async () => {
      const describePolicyTool = new DescribePolicyTool(policyProvider);
      
      try {
        await describePolicyTool.execute({
          [TEXT.FIELD_SECRET_ID]: 'non_existent_secret'
        });
      } catch (error) {
        const err = error as ToolError;
        expect({
          code: err.code,
          message: err.message
        }).toMatchInlineSnapshot(`
          {
            "code": "no_policy",
            "message": "Policy not found for secret",
          }
        `);
      }
    });

    it('should match snapshot for validation error', async () => {
      const describePolicyTool = new DescribePolicyTool(policyProvider);
      
      try {
        await describePolicyTool.execute({});
      } catch (error) {
        const err = error as ToolError;
        expect({
          code: err.code,
          message: err.message
        }).toMatchInlineSnapshot(`
          {
            "code": "invalid_request",
            "message": "Invalid request format",
          }
        `);
      }
    });

    it('should match snapshot for rate limit error', () => {
      const error = new ToolError(
        TEXT.ERROR_RATE_LIMITED,
        CONFIG.ERROR_CODE_RATE_LIMITED
      );
      
      expect({
        code: error.code,
        message: error.message
      }).toMatchInlineSnapshot(`
        {
          "code": "rate_limited",
          "message": "Rate limit exceeded",
        }
      `);
    });

    it('should match snapshot for forbidden domain error', () => {
      const error = new ToolError(
        TEXT.ERROR_FORBIDDEN_DOMAIN,
        CONFIG.ERROR_CODE_FORBIDDEN_DOMAIN
      );
      
      expect({
        code: error.code,
        message: error.message
      }).toMatchInlineSnapshot(`
        {
          "code": "forbidden_domain",
          "message": "Domain not allowed by policy",
        }
      `);
    });
  });

  describe('Pagination Snapshots', () => {
    it('should match snapshot for paginated audit query', async () => {
      await auditService.initialize();
      
      // Add multiple audit entries
      for (let i = 0; i < 25; i++) {
        await auditService.write({
          timestamp: new Date().toISOString(),
          secretId: `secret_${i}`,
          action: 'http_get',
          outcome: 'success',
          reason: 'Request completed'
        });
      }
      
      const queryAuditTool = new QueryAuditTool(auditService);
      const result = await queryAuditTool.execute({
        [TEXT.FIELD_PAGE]: 1,
        [TEXT.FIELD_PAGE_SIZE]: 10
      });
      
      expect({
        page: result[TEXT.FIELD_PAGE],
        pageSize: result[TEXT.FIELD_PAGE_SIZE],
        totalCount: result[TEXT.FIELD_TOTAL_COUNT],
        hasMore: result[TEXT.FIELD_HAS_MORE],
        entriesCount: result[TEXT.FIELD_ENTRIES].length
      }).toMatchInlineSnapshot(`
        {
          "entriesCount": 10,
          "hasMore": true,
          "page": 1,
          "pageSize": 10,
          "totalCount": 25,
        }
      `);
    });
  });

  describe('Empty Response Snapshots', () => {
    it('should match snapshot for empty secrets list', async () => {
      const emptyProvider = new EnvSecretProvider([]);
      const discoverTool = new DiscoverTool(emptyProvider);
      const result = await discoverTool.execute({});
      
      expect(result).toMatchInlineSnapshot(`
        {
          "secrets": [],
        }
      `);
    });

    it('should match snapshot for empty audit log', async () => {
      await auditService.initialize();
      const queryAuditTool = new QueryAuditTool(auditService);
      const result = await queryAuditTool.execute({});
      
      expect(result).toMatchInlineSnapshot(`
        {
          "entries": [],
          "hasMore": false,
          "page": 1,
          "pageSize": 50,
          "totalCount": 0,
        }
      `);
    });
  });

  describe('Complex Object Snapshots', () => {
    it('should match snapshot for complex policy with all fields', async () => {
      const complexPolicy = {
        secretId: 'complex_secret',
        allowedActions: ['http_get', 'http_post'],
        allowedDomains: [
          'api.example.com',
          'test.example.com',
          'staging.example.com'
        ],
        rateLimit: {
          requests: 1000,
          windowSeconds: 86400
        },
        expiresAt: '2030-01-01T00:00:00Z'
      };
      
      vi.spyOn(policyProvider, 'getPolicy').mockReturnValue(complexPolicy);
      
      const describePolicyTool = new DescribePolicyTool(policyProvider);
      const result = await describePolicyTool.execute({
        [TEXT.FIELD_SECRET_ID]: 'complex_secret'
      });
      
      expect(result).toMatchInlineSnapshot(`
        {
          "allowedActions": [
            "http_get",
            "http_post",
          ],
          "allowedDomains": [
            "api.example.com",
            "test.example.com",
            "staging.example.com",
          ],
          "expiresAt": "2030-01-01T00:00:00Z",
          "rateLimit": {
            "requests": 1000,
            "windowSeconds": 86400,
          },
          "secretId": "complex_secret",
        }
      `);
    });

    it('should match snapshot for minimal policy', async () => {
      const minimalPolicy = {
        secretId: 'minimal_secret',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com']
      };
      
      vi.spyOn(policyProvider, 'getPolicy').mockReturnValue(minimalPolicy);
      
      const describePolicyTool = new DescribePolicyTool(policyProvider);
      const result = await describePolicyTool.execute({
        [TEXT.FIELD_SECRET_ID]: 'minimal_secret'
      });
      
      expect(result).toMatchInlineSnapshot(`
        {
          "allowedActions": [
            "http_get",
          ],
          "allowedDomains": [
            "api.example.com",
          ],
          "secretId": "minimal_secret",
        }
      `);
    });
  });
});