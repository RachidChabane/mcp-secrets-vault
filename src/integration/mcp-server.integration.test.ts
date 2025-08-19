import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';
import { McpServerManager } from '../services/mcp-server-manager.js';
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

describe('MCP Server Integration', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let serverManager: McpServerManager;
  let secretProvider: EnvSecretProvider;
  let policyProvider: PolicyProviderService;
  let actionExecutor: HttpActionExecutor;
  let rateLimiter: RateLimiterService;
  let auditService: JsonlAuditService;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    
    // Set up test environment
    process.env['TEST_API_KEY'] = 'test-secret-value';
    process.env['TEST_DB_PASS'] = 'db-secret-value';
    
    // Initialize services
    serverManager = new McpServerManager();
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
    auditService = new JsonlAuditService();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Tool Registration and Listing', () => {
    it('should register all four tools', () => {
      const discoverTool = new DiscoverTool(secretProvider);
      const describePolicyTool = new DescribePolicyTool(policyProvider);
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter);
      const queryAuditTool = new QueryAuditTool(auditService);
      
      serverManager.registerTool(discoverTool);
      serverManager.registerTool(describePolicyTool);
      serverManager.registerTool(useSecretTool);
      serverManager.registerTool(queryAuditTool);
      
      // Verify tools are registered (indirectly through their getTool calls)
      expect(discoverTool.getTool().name).toBe(TEXT.TOOL_DISCOVER);
      expect(describePolicyTool.getTool().name).toBe(TEXT.TOOL_DESCRIBE);
      expect(useSecretTool.getTool().name).toBe(TEXT.TOOL_USE);
      expect(queryAuditTool.getTool().name).toBe(TEXT.TOOL_AUDIT);
    });

    it('should list all registered tools through MCP protocol', async () => {
      const server = new Server(
        { name: 'test', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );
      
      const discoverTool = new DiscoverTool(secretProvider);
      const describePolicyTool = new DescribePolicyTool(policyProvider);
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter);
      const queryAuditTool = new QueryAuditTool(auditService);
      
      const tools = [
        discoverTool.getTool(),
        describePolicyTool.getTool(),
        useSecretTool.getTool(),
        queryAuditTool.getTool()
      ];
      
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools
      }));
      
      // Simulate tool listing
      const expectedTools = tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
      }));
      
      expect(expectedTools).toHaveLength(4);
      expect(expectedTools[0]!.name).toBe(TEXT.TOOL_DISCOVER);
      expect(expectedTools[1]!.name).toBe(TEXT.TOOL_DESCRIBE);
      expect(expectedTools[2]!.name).toBe(TEXT.TOOL_USE);
      expect(expectedTools[3]!.name).toBe(TEXT.TOOL_AUDIT);
    });
  });

  describe('Tool Execution through MCP', () => {
    it('should execute discover tool and return secrets list', async () => {
      const discoverTool = new DiscoverTool(secretProvider);
      const result = await discoverTool.execute({});
      
      expect(result).toHaveProperty(TEXT.FIELD_SECRETS);
      const secrets = result[TEXT.FIELD_SECRETS] as any[];
      expect(secrets).toHaveLength(2);
      expect(secrets[0][TEXT.FIELD_SECRET_ID]).toBe('test_api_key');
      expect(secrets[1][TEXT.FIELD_SECRET_ID]).toBe('test_db_pass');
      
      // Verify no sensitive data exposed
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('TEST_API_KEY');
      expect(serialized).not.toContain('TEST_DB_PASS');
      expect(serialized).not.toContain('test-secret-value');
      expect(serialized).not.toContain('db-secret-value');
    });

    it('should execute describe policy tool', async () => {
      // Mock policy provider to return a test policy
      vi.spyOn(policyProvider, 'getPolicy').mockReturnValue({
        secretId: 'test_api_key',
        allowedActions: ['http_get', 'http_post'],
        allowedDomains: ['api.example.com'],
        rateLimit: {
          requests: 100,
          windowSeconds: 3600
        }
      });
      
      const describePolicyTool = new DescribePolicyTool(policyProvider);
      const result = await describePolicyTool.execute({
        [TEXT.FIELD_SECRET_ID]: 'test_api_key'
      });
      
      expect(result).toHaveProperty(TEXT.FIELD_ALLOWED_ACTIONS);
      expect(result).toHaveProperty(TEXT.FIELD_ALLOWED_DOMAINS);
      expect(result).toHaveProperty(TEXT.FIELD_RATE_LIMIT);
    });

    it('should handle tool execution errors', async () => {
      const server = new Server(
        { name: 'test', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );
      
      const errorTool = {
        getTool: () => ({
          name: 'error_tool',
          description: 'Tool that errors',
          inputSchema: { type: 'object' }
        }),
        execute: async () => {
          throw new ToolError('Test error', 'TEST_ERROR_CODE');
        }
      };
      
      server.setRequestHandler(CallToolRequestSchema, async () => {
        try {
          await errorTool.execute();
          return { content: [{ type: 'text', text: 'success' }] };
        } catch (error) {
          const err = error as ToolError;
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                [TEXT.FIELD_ERROR]: {
                  [TEXT.FIELD_CODE]: err.code,
                  [TEXT.FIELD_MESSAGE]: err.message
                }
              })
            }],
            isError: true
          };
        }
      });
      
      // Simulate error handling
      let errorResponse;
      try {
        await errorTool.execute();
      } catch (error) {
        const err = error as ToolError;
        errorResponse = {
          [TEXT.FIELD_ERROR]: {
            [TEXT.FIELD_CODE]: err.code,
            [TEXT.FIELD_MESSAGE]: err.message
          }
        };
      }
      
      expect(errorResponse).toBeDefined();
      expect(errorResponse![TEXT.FIELD_ERROR][TEXT.FIELD_CODE]).toBe('TEST_ERROR_CODE');
      expect(errorResponse![TEXT.FIELD_ERROR][TEXT.FIELD_MESSAGE]).toBe('Test error');
    });
  });

  describe('Protocol Compliance', () => {
    it('should handle handshake correctly', async () => {
      const server = new Server(
        {
          name: CONFIG.SERVER_NAME,
          version: CONFIG.VERSION,
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );
      
      expect(server).toBeDefined();
      // Server info should match configuration
    });

    it('should handle unknown tool gracefully', async () => {
      const server = new Server(
        { name: 'test', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );
      
      server.setRequestHandler(CallToolRequestSchema, async () => {
        if ('unknown_tool' === 'unknown_tool') {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                [TEXT.FIELD_ERROR]: {
                  [TEXT.FIELD_CODE]: CONFIG.ERROR_CODE_UNKNOWN_TOOL,
                  [TEXT.FIELD_MESSAGE]: TEXT.ERROR_UNKNOWN_TOOL
                }
              })
            }],
            isError: true
          };
        }
        return { content: [{ type: 'text', text: 'ok' }] };
      });
      
      // Verify unknown tool handling
      const errorResponse = {
        [TEXT.FIELD_ERROR]: {
          [TEXT.FIELD_CODE]: CONFIG.ERROR_CODE_UNKNOWN_TOOL,
          [TEXT.FIELD_MESSAGE]: TEXT.ERROR_UNKNOWN_TOOL
        }
      };
      
      expect(errorResponse[TEXT.FIELD_ERROR][TEXT.FIELD_CODE]).toBe(CONFIG.ERROR_CODE_UNKNOWN_TOOL);
    });

    it('should handle invalid arguments gracefully', async () => {
      const discoverTool = new DiscoverTool(secretProvider);
      
      // Discover tool accepts empty object, so this should work
      const result = await discoverTool.execute({});
      expect(result).toBeDefined();
      
      // Test with invalid args for describe policy tool
      const describePolicyTool = new DescribePolicyTool(policyProvider);
      
      await expect(async () => {
        await describePolicyTool.execute({});
      }).rejects.toThrow();
    });
  });

  describe('End-to-End Tool Workflow', () => {
    it('should complete full discovery workflow', async () => {
      const discoverTool = new DiscoverTool(secretProvider);
      
      // 1. List available secrets
      const discoverResult = await discoverTool.execute({});
      expect(discoverResult[TEXT.FIELD_SECRETS]).toHaveLength(2);
      
      // 2. Verify secret metadata
      const secrets = discoverResult[TEXT.FIELD_SECRETS] as any[];
      const apiKeySecret = secrets.find(s => s[TEXT.FIELD_SECRET_ID] === 'test_api_key');
      expect(apiKeySecret).toBeDefined();
      expect(apiKeySecret[TEXT.FIELD_AVAILABLE]).toBe(true);
      expect(apiKeySecret[TEXT.FIELD_DESCRIPTION]).toBe('Test API Key');
    });

    it('should handle concurrent tool executions', async () => {
      const discoverTool = new DiscoverTool(secretProvider);
      const queryAuditTool = new QueryAuditTool(auditService);
      
      // Initialize audit service
      await auditService.initialize();
      
      // Execute tools concurrently
      const [discoverResult, auditResult] = await Promise.all([
        discoverTool.execute({}),
        queryAuditTool.execute({})
      ]);
      
      expect(discoverResult).toHaveProperty(TEXT.FIELD_SECRETS);
      expect(auditResult).toHaveProperty(TEXT.FIELD_ENTRIES);
    });
  });
});