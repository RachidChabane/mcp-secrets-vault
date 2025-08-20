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
import { PolicyConfig } from '../interfaces/policy.interface.js';

describe('MCP Protocol Flow Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let secretProvider: EnvSecretProvider;
  let policyProvider: PolicyProviderService;
  let actionExecutor: HttpActionExecutor;
  let rateLimiter: RateLimiterService;
  let auditService: JsonlAuditService;
  let testAuditDir: string;

  const testPolicies: PolicyConfig[] = [
    {
      secretId: 'test_api_key',
      allowedActions: ['http_get', 'http_post'],
      allowedDomains: ['api.example.com'],
      rateLimit: {
        requests: 5,
        windowSeconds: 60
      }
    },
    {
      secretId: 'test_db_pass',
      allowedActions: ['http_get'],
      allowedDomains: ['db.example.com'],
      rateLimit: {
        requests: 10,
        windowSeconds: 60
      }
    },
    {
      secretId: 'expired_key',
      allowedActions: ['http_get'],
      allowedDomains: ['api.example.com'],
      expiresAt: '2020-01-01T00:00:00Z'
    }
  ];

  beforeEach(async () => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    
    // Create unique temporary directory for audit logs
    testAuditDir = path.join(os.tmpdir(), `audit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testAuditDir, { recursive: true });
    
    // Set up test environment
    process.env['TEST_API_KEY'] = 'test-secret-value';
    process.env['TEST_DB_PASS'] = 'db-secret-value';
    process.env['EXPIRED_KEY'] = 'expired-secret-value';
    
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
      },
      {
        secretId: 'expired_key',
        envVar: 'EXPIRED_KEY',
        description: 'Expired Key'
      }
    ]);
    
    policyProvider = new PolicyProviderService();
    actionExecutor = new HttpActionExecutor();
    rateLimiter = new RateLimiterService();
    auditService = new JsonlAuditService(testAuditDir);
    
    await auditService.initialize();
    
    // Mock policy provider with loaded state
    vi.spyOn(policyProvider, 'getPolicy').mockImplementation((secretId) => {
      return testPolicies.find(p => p.secretId === secretId);
    });
    
    vi.spyOn(policyProvider, 'evaluate').mockImplementation((secretId, action, domain) => {
      const policy = testPolicies.find(p => p.secretId === secretId);
      if (!policy) {
        return {
          allowed: false,
          code: CONFIG.ERROR_CODE_NO_POLICY,
          message: TEXT.ERROR_POLICY_NOT_FOUND
        };
      }
      
      // Check if policy is expired
      if (policy.expiresAt && new Date(policy.expiresAt) < new Date()) {
        return {
          allowed: false,
          code: CONFIG.ERROR_CODE_POLICY_EXPIRED,
          message: TEXT.ERROR_POLICY_EXPIRED
        };
      }
      
      // Check allowed actions
      if (!policy.allowedActions.includes(action as any)) {
        return {
          allowed: false,
          code: CONFIG.ERROR_CODE_FORBIDDEN_ACTION,
          message: TEXT.ERROR_FORBIDDEN_ACTION
        };
      }
      
      // Check allowed domains
      if (!policy.allowedDomains.includes(domain)) {
        return {
          allowed: false,
          code: CONFIG.ERROR_CODE_FORBIDDEN_DOMAIN,
          message: TEXT.ERROR_FORBIDDEN_DOMAIN
        };
      }
      
      return { allowed: true };
    });
    
    vi.spyOn(policyProvider, 'hasPolicy').mockImplementation((secretId) => {
      return testPolicies.some(p => p.secretId === secretId);
    });
    
    // Mark policies as loaded by mocking the private field
    (policyProvider as any).policiesLoaded = true;
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

  describe('End-to-End Workflows', () => {
    it('should complete full discovery → describe → use workflow', async () => {
      // Step 1: Discover available secrets
      const discoverTool = new DiscoverTool(secretProvider);
      const discoverResult = await discoverTool.execute({});
      
      expect(discoverResult[TEXT.FIELD_SECRETS]).toHaveLength(3);
      const secrets = discoverResult[TEXT.FIELD_SECRETS] as any[];
      const apiKeySecret = secrets.find(s => s[TEXT.FIELD_SECRET_ID] === 'test_api_key');
      expect(apiKeySecret).toBeDefined();
      
      // Step 2: Describe policy for the discovered secret
      const describePolicyTool = new DescribePolicyTool(policyProvider);
      const policyResult = await describePolicyTool.execute({
        [TEXT.FIELD_SECRET_ID]: 'test_api_key'
      });
      
      expect(policyResult[TEXT.FIELD_ALLOWED_ACTIONS]).toContain('http_get');
      expect(policyResult[TEXT.FIELD_ALLOWED_DOMAINS]).toContain('api.example.com');
      expect(policyResult[TEXT.FIELD_RATE_LIMIT]).toEqual({
        requests: 5,
        windowSeconds: 60
      });
      
      // Step 3: Use the secret (mock HTTP response)
      vi.spyOn(actionExecutor, 'execute').mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ success: true })
      });
      
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter, auditService);
      const useResult = await useSecretTool.execute({
        secretId: 'test_api_key',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      });
      
      expect(useResult).toHaveProperty('statusCode', 200);
      
      // Step 4: Query audit log to verify the attempt was recorded
      const queryAuditTool = new QueryAuditTool(auditService);
      const auditResult = await queryAuditTool.execute({
        [TEXT.FIELD_SECRET_ID]: 'test_api_key'
      });
      
      expect(auditResult[TEXT.FIELD_ENTRIES]).toHaveLength(1);
      const auditEntry = auditResult[TEXT.FIELD_ENTRIES][0] as any;
      expect(auditEntry[TEXT.FIELD_SECRET_ID]).toBe('test_api_key');
      expect(auditEntry[TEXT.FIELD_ACTION]).toBe('http_get');
      expect(auditEntry[TEXT.FIELD_OUTCOME]).toBe('success');
    });

    it('should handle denied workflow with audit trail', async () => {
      // Attempt to use secret with forbidden domain
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter, auditService);
      
      await expect(async () => {
        await useSecretTool.execute({
          secretId: 'test_api_key',
          action: {
            type: 'http_get',
            url: 'https://evil.com/data'
          }
        });
      }).rejects.toThrow(ToolError);
      
      // Verify denial was audited
      const queryAuditTool = new QueryAuditTool(auditService);
      const auditResult = await queryAuditTool.execute({});
      
      expect(auditResult[TEXT.FIELD_ENTRIES]).toHaveLength(1);
      const auditEntry = auditResult[TEXT.FIELD_ENTRIES][0] as any;
      expect(auditEntry[TEXT.FIELD_OUTCOME]).toBe('denied');
      expect(auditEntry[TEXT.FIELD_REASON]).toContain('Domain not allowed');
    });
  });

  describe('Concurrent Tool Executions', () => {
    it('should handle multiple concurrent discoveries', async () => {
      const discoverTool = new DiscoverTool(secretProvider);
      
      const promises = Array.from({ length: 10 }, () => 
        discoverTool.execute({})
      );
      
      const results = await Promise.all(promises);
      
      // All results should be identical
      results.forEach(result => {
        expect(result[TEXT.FIELD_SECRETS]).toHaveLength(3);
      });
    });

    it('should handle concurrent use of different secrets', async () => {
      vi.spyOn(actionExecutor, 'execute').mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({ success: true })
      });
      
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter, auditService);
      
      const promises = [
        useSecretTool.execute({
          secretId: 'test_api_key',
          action: {
            type: 'http_get',
            url: 'https://api.example.com/1'
          }
        }),
        useSecretTool.execute({
          secretId: 'test_db_pass',
          action: {
            type: 'http_get',
            url: 'https://db.example.com/2'
          }
        })
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result).toHaveProperty('statusCode', 200);
      });
      
      // Verify both attempts were audited
      const queryAuditTool = new QueryAuditTool(auditService);
      const auditResult = await queryAuditTool.execute({});
      
      expect(auditResult[TEXT.FIELD_ENTRIES]).toHaveLength(2);
    });

    it('should maintain isolation between concurrent requests', async () => {
      const provider1 = new EnvSecretProvider([{
        secretId: 'secret1',
        envVar: 'SECRET1',
        description: 'Secret 1'
      }]);
      
      const provider2 = new EnvSecretProvider([{
        secretId: 'secret2',
        envVar: 'SECRET2',
        description: 'Secret 2'
      }]);
      
      const tool1 = new DiscoverTool(provider1);
      const tool2 = new DiscoverTool(provider2);
      
      const [result1, result2] = await Promise.all([
        tool1.execute({}),
        tool2.execute({})
      ]);
      
      const secrets1 = result1[TEXT.FIELD_SECRETS] as any[];
      const secrets2 = result2[TEXT.FIELD_SECRETS] as any[];
      
      expect(secrets1[0][TEXT.FIELD_SECRET_ID]).toBe('secret1');
      expect(secrets2[0][TEXT.FIELD_SECRET_ID]).toBe('secret2');
    });
  });

  describe('Rate Limiting Scenarios', () => {
    it('should enforce rate limits across requests', async () => {
      vi.spyOn(actionExecutor, 'execute').mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({ success: true })
      });
      
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter, auditService);
      
      // Make requests up to the limit (5 requests)
      for (let i = 0; i < 5; i++) {
        const result = await useSecretTool.execute({
          secretId: 'test_api_key',
          action: {
            type: 'http_get',
            url: `https://api.example.com/request${i}`
          }
        });
        expect(result).toHaveProperty('statusCode', 200);
      }
      
      // 6th request should be rate limited
      await expect(async () => {
        await useSecretTool.execute({
          secretId: 'test_api_key',
          action: {
            type: 'http_get',
            url: 'https://api.example.com/request6'
          }
        });
      }).rejects.toThrow(ToolError);
      
      // Verify rate limit was audited
      const queryAuditTool = new QueryAuditTool(auditService);
      const auditResult = await queryAuditTool.execute({});
      
      const entries = auditResult[TEXT.FIELD_ENTRIES] as any[];
      const rateLimitedEntry = entries.find(e => 
        e[TEXT.FIELD_OUTCOME] === 'denied' && 
        e[TEXT.FIELD_REASON].includes('Rate limit')
      );
      expect(rateLimitedEntry).toBeDefined();
    });

    it('should track rate limits per secret independently', async () => {
      vi.spyOn(actionExecutor, 'execute').mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({ success: true })
      });
      
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter, auditService);
      
      // Use test_api_key 3 times (limit is 5)
      for (let i = 0; i < 3; i++) {
        await useSecretTool.execute({
          secretId: 'test_api_key',
          action: {
            type: 'http_get',
            url: `https://api.example.com/${i}`
          }
        });
      }
      
      // Use test_db_pass 8 times (limit is 10)
      for (let i = 0; i < 8; i++) {
        await useSecretTool.execute({
          secretId: 'test_db_pass',
          action: {
            type: 'http_get',
            url: `https://db.example.com/${i}`
          }
        });
      }
      
      // Both should still have capacity
      const apiResult = await useSecretTool.execute({
        secretId: 'test_api_key',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/final'
        }
      });
      expect(apiResult).toHaveProperty('statusCode', 200);
      
      const dbResult = await useSecretTool.execute({
        secretId: 'test_db_pass',
        action: {
          type: 'http_get',
          url: 'https://db.example.com/final'
        }
      });
      expect(dbResult).toHaveProperty('statusCode', 200);
    });
  });

  describe('Edge Cases', () => {
    it('should handle expired policies', async () => {
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter, auditService);
      
      await expect(async () => {
        await useSecretTool.execute({
          secretId: 'expired_key',
          action: {
            type: 'http_get',
            url: 'https://api.example.com/data'
          }
        });
      }).rejects.toThrow(ToolError);
      
      // Verify expiration was audited
      const queryAuditTool = new QueryAuditTool(auditService);
      const auditResult = await queryAuditTool.execute({
        [TEXT.FIELD_SECRET_ID]: 'expired_key'
      });
      
      const entries = auditResult[TEXT.FIELD_ENTRIES] as any[];
      expect(entries[0][TEXT.FIELD_OUTCOME]).toBe('denied');
      expect(entries[0][TEXT.FIELD_REASON]).toContain('expired');
    });

    it('should handle large payloads gracefully', async () => {
      // Create provider with many secrets
      const manySecrets = Array.from({ length: 1000 }, (_, i) => ({
        secretId: `secret_${i}`,
        envVar: `SECRET_${i}`,
        description: `Test secret ${i}`
      }));
      
      const largeProvider = new EnvSecretProvider(manySecrets);
      const discoverTool = new DiscoverTool(largeProvider);
      
      const result = await discoverTool.execute({});
      expect(result[TEXT.FIELD_SECRETS]).toHaveLength(1000);
    });

    it('should handle timeout scenarios', async () => {
      vi.spyOn(actionExecutor, 'execute').mockRejectedValue(
        new ToolError(TEXT.ERROR_TIMEOUT, CONFIG.ERROR_CODE_TIMEOUT)
      );
      
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter, auditService);
      
      await expect(async () => {
        await useSecretTool.execute({
          secretId: 'test_api_key',
          action: {
            type: 'http_get',
            url: 'https://api.example.com/slow'
          }
        });
      }).rejects.toThrow(ToolError);
      
      // Verify timeout was audited
      const queryAuditTool = new QueryAuditTool(auditService);
      const auditResult = await queryAuditTool.execute({});
      
      const entries = auditResult[TEXT.FIELD_ENTRIES] as any[];
      expect(entries[0][TEXT.FIELD_OUTCOME]).toBe('error');
      expect(entries[0][TEXT.FIELD_REASON]).toContain('failed');
    });

    it('should handle malformed requests', async () => {
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter, auditService);
      
      // Missing required fields
      await expect(async () => {
        await useSecretTool.execute({
          secretId: 'test_api_key'
          // Missing action
        });
      }).rejects.toThrow();
      
      // Invalid URL format
      await expect(async () => {
        await useSecretTool.execute({
          secretId: 'test_api_key',
          action: {
            type: 'http_get',
            url: 'not-a-url'
          }
        });
      }).rejects.toThrow();
      
      // Invalid action type
      await expect(async () => {
        await useSecretTool.execute({
          secretId: 'test_api_key',
          action: {
            type: 'invalid_action' as any,
            url: 'https://api.example.com'
          }
        });
      }).rejects.toThrow();
    });
  });

  describe('Audit Trail Verification', () => {
    it('should record all attempts chronologically', async () => {
      vi.spyOn(actionExecutor, 'execute').mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({ success: true })
      });
      
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter, auditService);
      
      // Make several different attempts
      await useSecretTool.execute({
        secretId: 'test_api_key',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/1'
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      
      try {
        await useSecretTool.execute({
          secretId: 'test_api_key',
          action: {
            type: 'http_get',
            url: 'https://evil.com'
          }
        });
      } catch {
        // Expected to fail
      }
      
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      
      await useSecretTool.execute({
        secretId: 'test_db_pass',
        action: {
          type: 'http_get',
          url: 'https://db.example.com'
        }
      });
      
      // Query all audit entries
      const queryAuditTool = new QueryAuditTool(auditService);
      const auditResult = await queryAuditTool.execute({});
      
      const entries = auditResult[TEXT.FIELD_ENTRIES] as any[];
      expect(entries).toHaveLength(3);
      
      // Verify chronological order (newest first)
      const timestamps = entries.map(e => new Date(e[TEXT.FIELD_TIMESTAMP]).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i - 1]!).toBeGreaterThanOrEqual(timestamps[i]!);
      }
      
      // Verify outcomes
      expect(entries.filter(e => e[TEXT.FIELD_OUTCOME] === 'success')).toHaveLength(2);
      expect(entries.filter(e => e[TEXT.FIELD_OUTCOME] === 'denied')).toHaveLength(1);
    });

    it('should support filtering audit entries', async () => {
      vi.spyOn(actionExecutor, 'execute').mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({ success: true })
      });
      
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter, auditService);
      
      // Make attempts with different secrets
      await useSecretTool.execute({
        secretId: 'test_api_key',
        action: {
          type: 'http_get',
          url: 'https://api.example.com'
        }
      });
      
      await useSecretTool.execute({
        secretId: 'test_db_pass',
        action: {
          type: 'http_get',
          url: 'https://db.example.com'
        }
      });
      
      await useSecretTool.execute({
        secretId: 'test_api_key',
        action: {
          type: 'http_post',
          url: 'https://api.example.com'
        }
      });
      
      // Filter by secret ID
      const queryAuditTool = new QueryAuditTool(auditService);
      const filteredResult = await queryAuditTool.execute({
        [TEXT.FIELD_SECRET_ID]: 'test_api_key'
      });
      
      const entries = filteredResult[TEXT.FIELD_ENTRIES] as any[];
      expect(entries).toHaveLength(2);
      entries.forEach(entry => {
        expect(entry[TEXT.FIELD_SECRET_ID]).toBe('test_api_key');
      });
    });
  });
});