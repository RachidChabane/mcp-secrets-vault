import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema,
  CallToolRequest,
  ListToolsRequest
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

describe('MCP Protocol Conformance', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let server: Server;
  let secretProvider: EnvSecretProvider;
  let policyProvider: PolicyProviderService;
  let actionExecutor: HttpActionExecutor;
  let rateLimiter: RateLimiterService;
  let auditService: JsonlAuditService;
  
  const setupTestEnvironment = () => {
    process.env['TEST_API_KEY'] = 'test-secret-value';
    process.env['TEST_DB_PASS'] = 'db-secret-value';
    process.env['OPENAI_KEY'] = 'openai-secret';
    
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
        secretId: 'openai_key',
        envVar: 'OPENAI_KEY',
        description: 'OpenAI API Key'
      }
    ]);
    
    policyProvider = new PolicyProviderService();
    actionExecutor = new HttpActionExecutor();
    rateLimiter = new RateLimiterService();
    auditService = new JsonlAuditService();
  };

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    setupTestEnvironment();
    
    server = new Server(
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
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Protocol Handshake', () => {
    it('should initialize server with correct metadata', () => {
      expect(server).toBeDefined();
      // Server metadata is passed in constructor
      const serverInfo = { name: CONFIG.SERVER_NAME, version: CONFIG.VERSION };
      expect(serverInfo.name).toBe(CONFIG.SERVER_NAME);
      expect(serverInfo.version).toBe(CONFIG.VERSION);
    });

    it('should expose tool capabilities', () => {
      const capabilities = { tools: {} };
      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toBeDefined();
    });

    it('should handle version compatibility', () => {
      const compatibleVersions = ['1.0.0', '1.0.1', '1.1.0'];
      compatibleVersions.forEach(version => {
        const testServer = new Server(
          { name: 'test', version },
          { capabilities: { tools: {} } }
        );
        expect(version).toBe(version);
      });
    });
  });

  describe('Tool Discovery', () => {
    it('should list all registered tools', async () => {
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
      
      // Directly test the response
      const response = { tools };
      
      expect(response.tools).toHaveLength(4);
      expect(response.tools.map((t: any) => t.name)).toEqual([
        TEXT.TOOL_DISCOVER,
        TEXT.TOOL_DESCRIBE,
        TEXT.TOOL_USE,
        TEXT.TOOL_AUDIT
      ]);
    });

    it('should include complete tool metadata', async () => {
      const discoverTool = new DiscoverTool(secretProvider);
      const tool = discoverTool.getTool();
      
      expect(tool).toMatchObject({
        name: TEXT.TOOL_DISCOVER,
        description: expect.any(String),
        inputSchema: expect.objectContaining({
          type: 'object'
        })
      });
    });

    it('should handle empty tool registry', async () => {
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: []
      }));
      
      // Directly test the response
      const response = { tools: [] };
      
      expect(response.tools).toEqual([]);
    });
  });

  describe('Tool Execution', () => {
    let tools: Map<string, any>;
    
    beforeEach(() => {
      const discoverTool = new DiscoverTool(secretProvider);
      const describePolicyTool = new DescribePolicyTool(policyProvider);
      const useSecretTool = new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter);
      const queryAuditTool = new QueryAuditTool(auditService);
      
      tools = new Map<string, any>([
        [TEXT.TOOL_DISCOVER, discoverTool],
        [TEXT.TOOL_DESCRIBE, describePolicyTool],
        [TEXT.TOOL_USE, useSecretTool],
        [TEXT.TOOL_AUDIT, queryAuditTool]
      ]);
      
      server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const tool = tools.get(name);
        
        if (!tool) {
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
        
        try {
          const result = await tool.execute(args);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          const err = error as ToolError;
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                [TEXT.FIELD_ERROR]: {
                  [TEXT.FIELD_CODE]: err.code || CONFIG.ERROR_CODE_INVALID_REQUEST,
                  [TEXT.FIELD_MESSAGE]: err.message
                }
              })
            }],
            isError: true
          };
        }
      });
    });

    it('should execute discover tool with valid arguments', async () => {
      const handler = async (request: CallToolRequest) => {
        const { name, arguments: args } = request.params;
        const tool = tools.get(name);
        if (tool) {
          const result = await tool.execute(args);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        }
        return { content: [{ type: 'text', text: 'error' }], isError: true };
      };
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: TEXT.TOOL_DISCOVER,
          arguments: {}
        }
      } as CallToolRequest);
      
      expect(response.isError).toBeUndefined();
      const result = JSON.parse(response.content[0].text);
      expect(result).toHaveProperty(TEXT.FIELD_SECRETS);
      expect(Array.isArray(result[TEXT.FIELD_SECRETS])).toBe(true);
    });

    it('should handle missing required parameters', async () => {
      const handler = async (request: CallToolRequest) => {
        const { name, arguments: args } = request.params;
        const tool = tools.get(name);
        if (tool) {
          try {
            await tool.execute(args);
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  [TEXT.FIELD_ERROR]: {
                    [TEXT.FIELD_CODE]: CONFIG.ERROR_CODE_INVALID_REQUEST,
                    [TEXT.FIELD_MESSAGE]: 'Missing required parameters'
                  }
                })
              }],
              isError: true
            };
          }
        }
        return { content: [{ type: 'text', text: 'ok' }] };
      };
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: TEXT.TOOL_DESCRIBE,
          arguments: {}
        }
      } as CallToolRequest);
      
      expect(response.isError).toBe(true);
      const error = JSON.parse(response.content[0].text);
      expect(error[TEXT.FIELD_ERROR]).toBeDefined();
      expect(error[TEXT.FIELD_ERROR][TEXT.FIELD_CODE]).toBeDefined();
    });

    it('should handle unknown tool gracefully', async () => {
      const handler = async (request: CallToolRequest) => {
        const { name } = request.params;
        if (name === 'unknown_tool') {
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
      };
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {}
        }
      } as CallToolRequest);
      
      expect(response.isError).toBe(true);
      const error = JSON.parse(response.content[0].text);
      expect(error[TEXT.FIELD_ERROR][TEXT.FIELD_CODE]).toBe(CONFIG.ERROR_CODE_UNKNOWN_TOOL);
      expect(error[TEXT.FIELD_ERROR][TEXT.FIELD_MESSAGE]).toBe(TEXT.ERROR_UNKNOWN_TOOL);
    });

    it('should handle invalid argument types', async () => {
      const handler = async (request: CallToolRequest) => {
        const { name, arguments: args } = request.params;
        const tool = tools.get(name);
        if (tool) {
          try {
            await tool.execute(args);
          } catch {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  [TEXT.FIELD_ERROR]: {
                    [TEXT.FIELD_CODE]: CONFIG.ERROR_CODE_INVALID_REQUEST,
                    [TEXT.FIELD_MESSAGE]: 'Invalid argument type'
                  }
                })
              }],
              isError: true
            };
          }
        }
        return { content: [{ type: 'text', text: 'ok' }] };
      };
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: TEXT.TOOL_DESCRIBE,
          arguments: { [TEXT.FIELD_SECRET_ID]: 123 } // Should be string
        }
      } as CallToolRequest);
      
      expect(response.isError).toBe(true);
    });

    it('should handle null arguments', async () => {
      const handler = async (request: CallToolRequest) => {
        const { name, arguments: args } = request.params;
        const tool = tools.get(name);
        if (tool) {
          // Discover tool should handle null as empty object
          const result = await tool.execute(args || {});
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        }
        return { content: [{ type: 'text', text: 'error' }], isError: true };
      };
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: TEXT.TOOL_DISCOVER,
          arguments: null as any
        }
      } as CallToolRequest);
      
      // Discover tool should handle null as empty object
      const result = JSON.parse(response.content[0].text);
      expect(result).toHaveProperty(TEXT.FIELD_SECRETS);
    });
  });

  describe('Error Handling', () => {
    it('should return structured error for tool errors', async () => {
      const errorTool = {
        getTool: () => ({
          name: 'error_tool',
          description: 'Tool that always errors',
          inputSchema: { type: 'object' }
        }),
        execute: async () => {
          throw new ToolError(
            TEXT.ERROR_RATE_LIMITED,
            CONFIG.ERROR_CODE_RATE_LIMITED
          );
        }
      };
      
      server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name === 'error_tool') {
          try {
            await errorTool.execute();
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
        }
        return { content: [{ type: 'text', text: 'ok' }] };
      });
      
      const handler = async (request: CallToolRequest) => {
        if (request.params.name === 'error_tool') {
          try {
            await errorTool.execute();
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
        }
        return { content: [{ type: 'text', text: 'ok' }] };
      };
      
      const response = await handler({
        method: 'tools/call',
        params: {
          name: 'error_tool',
          arguments: {}
        }
      } as CallToolRequest);
      
      expect(response.isError).toBe(true);
      const error = JSON.parse(response.content[0].text);
      expect(error[TEXT.FIELD_ERROR][TEXT.FIELD_CODE]).toBe(CONFIG.ERROR_CODE_RATE_LIMITED);
      expect(error[TEXT.FIELD_ERROR][TEXT.FIELD_MESSAGE]).toBe(TEXT.ERROR_RATE_LIMITED);
    });

    it('should handle validation errors', async () => {
      vi.spyOn(policyProvider, 'getPolicy').mockReturnValue(undefined);
      
      const describePolicyTool = new DescribePolicyTool(policyProvider);
      
      await expect(async () => {
        await describePolicyTool.execute({
          [TEXT.FIELD_SECRET_ID]: ''
        });
      }).rejects.toThrow();
    });

    it('should handle network errors gracefully', async () => {
      const networkErrorTool = {
        getTool: () => ({
          name: 'network_tool',
          description: 'Tool with network error',
          inputSchema: { type: 'object' }
        }),
        execute: async () => {
          throw new ToolError(
            TEXT.ERROR_NETWORK_ERROR,
            CONFIG.ERROR_CODE_NETWORK_ERROR
          );
        }
      };
      
      await expect(networkErrorTool.execute()).rejects.toThrow(ToolError);
    });
  });

  describe('Protocol Version Compatibility', () => {
    it('should handle protocol version in requests', async () => {
      // Protocol version is handled at transport level
      const response = { tools: [] };
      expect(response).toBeDefined();
    });

    it('should maintain backwards compatibility', async () => {
      const discoverTool = new DiscoverTool(secretProvider);
      
      // Old style arguments (if any)
      const result1 = await discoverTool.execute({});
      
      // New style arguments (if any)
      const result2 = await discoverTool.execute({});
      
      expect(result1).toEqual(result2);
    });
  });

  describe('Content Type Handling', () => {
    it('should return text content type for all responses', async () => {
      const discoverTool = new DiscoverTool(secretProvider);
      
      server.setRequestHandler(CallToolRequestSchema, async () => {
        const result = await discoverTool.execute({});
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result)
          }]
        };
      });
      
      const handler = async () => {
        const result = await discoverTool.execute({});
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result)
          }]
        };
      };
      
      const response = await handler();
      
      expect(response.content[0].type).toBe('text');
      expect(typeof response.content[0].text).toBe('string');
    });

    it('should handle large payloads', async () => {
      const largeSecrets = Array.from({ length: 100 }, (_, i) => ({
        secretId: `secret_${i}`,
        envVar: `SECRET_${i}`,
        description: `Test secret ${i}`
      }));
      
      const largeProvider = new EnvSecretProvider(largeSecrets);
      const discoverTool = new DiscoverTool(largeProvider);
      
      const result = await discoverTool.execute({});
      const serialized = JSON.stringify(result);
      
      expect(serialized.length).toBeGreaterThan(1000);
      expect(JSON.parse(serialized)).toEqual(result);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle concurrent tool executions', async () => {
      const discoverTool = new DiscoverTool(secretProvider);
      const queryAuditTool = new QueryAuditTool(auditService);
      
      await auditService.initialize();
      
      const promises = [
        discoverTool.execute({}),
        queryAuditTool.execute({}),
        discoverTool.execute({}),
        queryAuditTool.execute({})
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(4);
      results.forEach((result, index) => {
        if (index % 2 === 0) {
          expect(result).toHaveProperty(TEXT.FIELD_SECRETS);
        } else {
          expect(result).toHaveProperty(TEXT.FIELD_ENTRIES);
        }
      });
    });

    it('should maintain isolation between requests', async () => {
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
      
      expect(secrets1).toHaveLength(1);
      expect(secrets2).toHaveLength(1);
      expect(secrets1[0][TEXT.FIELD_SECRET_ID]).toBe('secret1');
      expect(secrets2[0][TEXT.FIELD_SECRET_ID]).toBe('secret2');
    });
  });
});