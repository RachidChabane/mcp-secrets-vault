import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';
import { DiscoverTool } from '../tools/discover-tool.js';
import { DescribePolicyTool } from '../tools/describe-policy-tool.js';
import { UseSecretTool } from '../tools/use-secret-tool.js';
import { QueryAuditTool } from '../tools/query-audit-tool.js';
import { EnvSecretProvider } from '../services/env-secret-provider.js';
import { PolicyProviderService } from '../services/policy-provider.service.js';
import { HttpActionExecutor } from '../services/http-action-executor.service.js';
import { RateLimiterService } from '../services/rate-limiter.service.js';
import { JsonlAuditService } from '../services/audit-service.js';
import { PolicyEvaluatorService } from '../services/policy-evaluator.service.js';
import { ToolError } from '../utils/errors.js';
import { PolicyConfig } from '../interfaces/policy.interface.js';

describe('MCP Protocol Flow Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let secretProvider: EnvSecretProvider;
  let policyProvider: PolicyProviderService;
  let actionExecutor: HttpActionExecutor;
  let rateLimiter: RateLimiterService;
  let auditService: JsonlAuditService;
  let policyEvaluator: PolicyEvaluatorService;

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
    auditService = new JsonlAuditService();
    policyEvaluator = new PolicyEvaluatorService(testPolicies);
    
    await auditService.initialize();
    
    // Mock policy provider
    vi.spyOn(policyProvider, 'getPolicy').mockImplementation((secretId) => {
      return testPolicies.find(p => p.secretId === secretId);
    });
  });

  afterEach(() => {
    process.env = originalEnv;
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
      vi.spyOn(actionExecutor, 'executeHttp').mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: { success: true }
      });
      
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter);
      const useResult = await useSecretTool.execute({
        [TEXT.FIELD_SECRET_ID]: 'test_api_key',
        [TEXT.FIELD_ACTION]: 'http_get',
        [TEXT.FIELD_URL]: 'https://api.example.com/data',
        [TEXT.FIELD_METHOD]: 'GET'
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
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter);
      
      await expect(async () => {
        await useSecretTool.execute({
          [TEXT.FIELD_SECRET_ID]: 'test_api_key',
          [TEXT.FIELD_ACTION]: 'http_get',
          [TEXT.FIELD_URL]: 'https://evil.com/data',
          [TEXT.FIELD_METHOD]: 'GET'
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
      vi.spyOn(actionExecutor, 'executeHttp').mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: { success: true }
      });
      
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter);
      
      const promises = [
        useSecretTool.execute({
          [TEXT.FIELD_SECRET_ID]: 'test_api_key',
          [TEXT.FIELD_ACTION]: 'http_get',
          [TEXT.FIELD_URL]: 'https://api.example.com/1',
          [TEXT.FIELD_METHOD]: 'GET'
        }),
        useSecretTool.execute({
          [TEXT.FIELD_SECRET_ID]: 'test_db_pass',
          [TEXT.FIELD_ACTION]: 'http_get',
          [TEXT.FIELD_URL]: 'https://db.example.com/2',
          [TEXT.FIELD_METHOD]: 'GET'
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
      vi.spyOn(actionExecutor, 'executeHttp').mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: { success: true }
      });
      
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter);
      
      // Make requests up to the limit (5 requests)
      for (let i = 0; i < 5; i++) {
        const result = await useSecretTool.execute({
          [TEXT.FIELD_SECRET_ID]: 'test_api_key',
          [TEXT.FIELD_ACTION]: 'http_get',
          [TEXT.FIELD_URL]: `https://api.example.com/request${i}`,
          [TEXT.FIELD_METHOD]: 'GET'
        });
        expect(result).toHaveProperty('statusCode', 200);
      }
      
      // 6th request should be rate limited
      await expect(async () => {
        await useSecretTool.execute({
          [TEXT.FIELD_SECRET_ID]: 'test_api_key',
          [TEXT.FIELD_ACTION]: 'http_get',
          [TEXT.FIELD_URL]: 'https://api.example.com/request6',
          [TEXT.FIELD_METHOD]: 'GET'
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
      vi.spyOn(actionExecutor, 'executeHttp').mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: { success: true }
      });
      
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter);
      
      // Use test_api_key 3 times (limit is 5)
      for (let i = 0; i < 3; i++) {
        await useSecretTool.execute({
          [TEXT.FIELD_SECRET_ID]: 'test_api_key',
          [TEXT.FIELD_ACTION]: 'http_get',
          [TEXT.FIELD_URL]: `https://api.example.com/${i}`,
          [TEXT.FIELD_METHOD]: 'GET'
        });
      }
      
      // Use test_db_pass 8 times (limit is 10)
      for (let i = 0; i < 8; i++) {
        await useSecretTool.execute({
          [TEXT.FIELD_SECRET_ID]: 'test_db_pass',
          [TEXT.FIELD_ACTION]: 'http_get',
          [TEXT.FIELD_URL]: `https://db.example.com/${i}`,
          [TEXT.FIELD_METHOD]: 'GET'
        });
      }
      
      // Both should still have capacity
      const apiResult = await useSecretTool.execute({
        [TEXT.FIELD_SECRET_ID]: 'test_api_key',
        [TEXT.FIELD_ACTION]: 'http_get',
        [TEXT.FIELD_URL]: 'https://api.example.com/final',
        [TEXT.FIELD_METHOD]: 'GET'
      });
      expect(apiResult).toHaveProperty('statusCode', 200);
      
      const dbResult = await useSecretTool.execute({
        [TEXT.FIELD_SECRET_ID]: 'test_db_pass',
        [TEXT.FIELD_ACTION]: 'http_get',
        [TEXT.FIELD_URL]: 'https://db.example.com/final',
        [TEXT.FIELD_METHOD]: 'GET'
      });
      expect(dbResult).toHaveProperty('statusCode', 200);
    });
  });

  describe('Edge Cases', () => {
    it('should handle expired policies', async () => {
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter);
      
      await expect(async () => {
        await useSecretTool.execute({
          [TEXT.FIELD_SECRET_ID]: 'expired_key',
          [TEXT.FIELD_ACTION]: 'http_get',
          [TEXT.FIELD_URL]: 'https://api.example.com/data',
          [TEXT.FIELD_METHOD]: 'GET'
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
      vi.spyOn(actionExecutor, 'executeHttp').mockRejectedValue(
        new ToolError(TEXT.ERROR_TIMEOUT, CONFIG.ERROR_CODE_TIMEOUT)
      );
      
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter);
      
      await expect(async () => {
        await useSecretTool.execute({
          [TEXT.FIELD_SECRET_ID]: 'test_api_key',
          [TEXT.FIELD_ACTION]: 'http_get',
          [TEXT.FIELD_URL]: 'https://api.example.com/slow',
          [TEXT.FIELD_METHOD]: 'GET'
        });
      }).rejects.toThrow(ToolError);
      
      // Verify timeout was audited
      const queryAuditTool = new QueryAuditTool(auditService);
      const auditResult = await queryAuditTool.execute({});
      
      const entries = auditResult[TEXT.FIELD_ENTRIES] as any[];
      expect(entries[0][TEXT.FIELD_OUTCOME]).toBe('denied');
      expect(entries[0][TEXT.FIELD_REASON]).toContain('timeout');
    });

    it('should handle malformed requests', async () => {
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter);
      
      // Missing required fields
      await expect(async () => {
        await useSecretTool.execute({
          [TEXT.FIELD_SECRET_ID]: 'test_api_key'
          // Missing action and url
        });
      }).rejects.toThrow();
      
      // Invalid URL format
      await expect(async () => {
        await useSecretTool.execute({
          [TEXT.FIELD_SECRET_ID]: 'test_api_key',
          [TEXT.FIELD_ACTION]: 'http_get',
          [TEXT.FIELD_URL]: 'not-a-url',
          [TEXT.FIELD_METHOD]: 'GET'
        });
      }).rejects.toThrow();
      
      // Invalid action
      await expect(async () => {
        await useSecretTool.execute({
          [TEXT.FIELD_SECRET_ID]: 'test_api_key',
          [TEXT.FIELD_ACTION]: 'invalid_action',
          [TEXT.FIELD_URL]: 'https://api.example.com',
          [TEXT.FIELD_METHOD]: 'GET'
        });
      }).rejects.toThrow();
    });
  });

  describe('Audit Trail Verification', () => {
    it('should record all attempts chronologically', async () => {
      vi.spyOn(actionExecutor, 'executeHttp').mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: { success: true }
      });
      
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter);
      
      // Make several different attempts
      await useSecretTool.execute({
        [TEXT.FIELD_SECRET_ID]: 'test_api_key',
        [TEXT.FIELD_ACTION]: 'http_get',
        [TEXT.FIELD_URL]: 'https://api.example.com/1',
        [TEXT.FIELD_METHOD]: 'GET'
      });
      
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      
      try {
        await useSecretTool.execute({
          [TEXT.FIELD_SECRET_ID]: 'test_api_key',
          [TEXT.FIELD_ACTION]: 'http_get',
          [TEXT.FIELD_URL]: 'https://evil.com',
          [TEXT.FIELD_METHOD]: 'GET'
        });
      } catch {
        // Expected to fail
      }
      
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      
      await useSecretTool.execute({
        [TEXT.FIELD_SECRET_ID]: 'test_db_pass',
        [TEXT.FIELD_ACTION]: 'http_get',
        [TEXT.FIELD_URL]: 'https://db.example.com',
        [TEXT.FIELD_METHOD]: 'GET'
      });
      
      // Query all audit entries
      const queryAuditTool = new QueryAuditTool(auditService);
      const auditResult = await queryAuditTool.execute({});
      
      const entries = auditResult[TEXT.FIELD_ENTRIES] as any[];
      expect(entries).toHaveLength(3);
      
      // Verify chronological order (newest first)
      const timestamps = entries.map(e => new Date(e[TEXT.FIELD_TIMESTAMP]).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
      }
      
      // Verify outcomes
      expect(entries.filter(e => e[TEXT.FIELD_OUTCOME] === 'success')).toHaveLength(2);
      expect(entries.filter(e => e[TEXT.FIELD_OUTCOME] === 'denied')).toHaveLength(1);
    });

    it('should support filtering audit entries', async () => {
      vi.spyOn(actionExecutor, 'executeHttp').mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: { success: true }
      });
      
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter);
      
      // Make attempts with different secrets
      await useSecretTool.execute({
        [TEXT.FIELD_SECRET_ID]: 'test_api_key',
        [TEXT.FIELD_ACTION]: 'http_get',
        [TEXT.FIELD_URL]: 'https://api.example.com',
        [TEXT.FIELD_METHOD]: 'GET'
      });
      
      await useSecretTool.execute({
        [TEXT.FIELD_SECRET_ID]: 'test_db_pass',
        [TEXT.FIELD_ACTION]: 'http_get',
        [TEXT.FIELD_URL]: 'https://db.example.com',
        [TEXT.FIELD_METHOD]: 'GET'
      });
      
      await useSecretTool.execute({
        [TEXT.FIELD_SECRET_ID]: 'test_api_key',
        [TEXT.FIELD_ACTION]: 'http_post',
        [TEXT.FIELD_URL]: 'https://api.example.com',
        [TEXT.FIELD_METHOD]: 'POST'
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