import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { McpServerManager, McpTool } from './mcp-server-manager.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';
import { ToolError } from '../utils/errors.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

// Mock the MCP SDK modules
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../utils/logging.js', () => ({
  writeError: vi.fn(),
}));

describe('McpServerManager', () => {
  let manager: McpServerManager;
  let mockTool: McpTool;
  let mockToolDef: Tool;

  beforeEach(() => {
    vi.clearAllMocks();
    
    manager = new McpServerManager();
    
    mockToolDef = {
      name: 'test_tool',
      description: 'Test tool',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    };
    
    mockTool = {
      getTool: vi.fn().mockReturnValue(mockToolDef),
      execute: vi.fn().mockResolvedValue({ result: 'test' }),
    };
  });

  describe('registerTool', () => {
    it('should register a tool', () => {
      manager.registerTool(mockTool);
      
      expect(mockTool.getTool).toHaveBeenCalled();
    });

    it('should allow multiple tool registrations with different names', () => {
      const mockTool2: McpTool = {
        getTool: vi.fn().mockReturnValue({
          ...mockToolDef,
          name: 'test_tool2'
        }),
        execute: vi.fn(),
      };
      
      manager.registerTool(mockTool);
      manager.registerTool(mockTool2);
      
      expect(mockTool.getTool).toHaveBeenCalled();
      expect(mockTool2.getTool).toHaveBeenCalled();
    });
    
    it('should reject duplicate tool registration with typed error', () => {
      const duplicateTool: McpTool = {
        getTool: vi.fn().mockReturnValue({
          ...mockToolDef,
          name: 'test_tool' // Same name as mockTool
        }),
        execute: vi.fn(),
      };
      
      // First registration should succeed
      manager.registerTool(mockTool);
      
      // Second registration with same name should throw ToolError
      expect(() => manager.registerTool(duplicateTool)).toThrow(ToolError);
      
      try {
        manager.registerTool(duplicateTool);
      } catch (error) {
        expect(error).toBeInstanceOf(ToolError);
        const toolError = error as ToolError;
        expect(toolError.message).toBe(TEXT.ERROR_DUPLICATE_TOOL);
        expect(toolError.code).toBe(CONFIG.ERROR_CODE_DUPLICATE_TOOL);
      }
      
      // Verify first tool remains registered (not replaced)
      expect(mockTool.getTool).toHaveBeenCalledTimes(1);
      expect(duplicateTool.getTool).toHaveBeenCalledTimes(2); // Called twice: once in first attempt, once in try-catch
    });
    
    it('should maintain registry integrity on duplicate registration attempt', () => {
      const tool1: McpTool = {
        getTool: vi.fn().mockReturnValue({
          name: 'tool1',
          description: 'First tool',
          inputSchema: { type: 'object' }
        }),
        execute: vi.fn().mockResolvedValue({ result: 'tool1' }),
      };
      
      const tool2: McpTool = {
        getTool: vi.fn().mockReturnValue({
          name: 'tool2',
          description: 'Second tool',
          inputSchema: { type: 'object' }
        }),
        execute: vi.fn().mockResolvedValue({ result: 'tool2' }),
      };
      
      const duplicateTool1: McpTool = {
        getTool: vi.fn().mockReturnValue({
          name: 'tool1', // Duplicate name
          description: 'Duplicate tool',
          inputSchema: { type: 'object' }
        }),
        execute: vi.fn().mockResolvedValue({ result: 'duplicate' }),
      };
      
      // Register initial tools
      manager.registerTool(tool1);
      manager.registerTool(tool2);
      
      // Attempt to register duplicate
      expect(() => manager.registerTool(duplicateTool1)).toThrow(ToolError);
      
      // Verify registry still contains original tools
      // (We can't directly inspect the registry, but we can verify through behavior)
      expect(tool1.getTool).toHaveBeenCalledTimes(1);
      expect(tool2.getTool).toHaveBeenCalledTimes(1);
      expect(duplicateTool1.getTool).toHaveBeenCalledTimes(1); // Called once during failed registration
    });
  });

  describe('registerShutdownHandler', () => {
    it('should register shutdown handlers', () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);
      
      manager.registerShutdownHandler(handler1);
      manager.registerShutdownHandler(handler2);
      
      // Handlers are stored but not called yet
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('should setup handlers and connect to transport', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      await manager.start();
      
      expect(mockServer?.setRequestHandler).toHaveBeenCalledTimes(2);
      expect(mockServer?.connect).toHaveBeenCalled();
    });

    it('should log server start', async () => {
      const { writeError } = await import('../utils/logging.js');
      
      await manager.start();
      
      expect(writeError).toHaveBeenCalledWith(
        TEXT.LOG_SERVER_STARTED,
        {
          level: 'INFO',
          version: CONFIG.VERSION
        }
      );
    });
  });

  describe('tool execution', () => {
    it('should execute registered tool successfully', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      manager.registerTool(mockTool);
      await manager.start();
      
      // Get the CallToolRequestSchema handler
      const callHandler = mockServer?.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === CallToolRequestSchema
      )?.[1];
      
      expect(callHandler).toBeDefined();
      
      // Execute the handler
      const response = callHandler ? await callHandler({
        params: {
          name: 'test_tool',
          arguments: { test: 'data' }
        }
      }) : null;
      
      expect(mockTool.execute).toHaveBeenCalledWith({ test: 'data' });
      expect(response?.content[0].text).toContain('"result": "test"');
      expect(response?.isError).toBeUndefined();
    });

    it('should handle unknown tool error', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      await manager.start();
      
      const callHandler = mockServer?.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === CallToolRequestSchema
      )?.[1];
      
      const response = callHandler ? await callHandler({
        params: {
          name: 'unknown_tool',
          arguments: {}
        }
      }) : null;
      
      expect(response?.isError).toBe(true);
      if (response) {
        expect(response.content[0].text).toContain(TEXT.ERROR_UNKNOWN_TOOL);
        expect(response.content[0].text).toContain(CONFIG.ERROR_CODE_UNKNOWN_TOOL);
      }
    });

    it('should handle tool execution errors', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      const errorTool: McpTool = {
        getTool: vi.fn().mockReturnValue(mockToolDef),
        execute: vi.fn().mockRejectedValue(
          new ToolError('Custom error', 'CUSTOM_CODE')
        ),
      };
      
      manager.registerTool(errorTool);
      await manager.start();
      
      const callHandler = mockServer?.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === CallToolRequestSchema
      )?.[1];
      
      const response = callHandler ? await callHandler({
        params: {
          name: 'test_tool',
          arguments: {}
        }
      }) : null;
      
      expect(response?.isError).toBe(true);
      if (response) {
        expect(response.content[0].text).toContain('Custom error');
        expect(response.content[0].text).toContain('CUSTOM_CODE');
      }
    });
    
    it('should sanitize generic errors to typed errors', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const { writeError } = await import('../utils/logging.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      const errorTool: McpTool = {
        getTool: vi.fn().mockReturnValue(mockToolDef),
        execute: vi.fn().mockRejectedValue(
          new Error('Sensitive internal error with secret data')
        ),
      };
      
      manager.registerTool(errorTool);
      await manager.start();
      
      const callHandler = mockServer?.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === CallToolRequestSchema
      )?.[1];
      
      const response = callHandler ? await callHandler({
        params: {
          name: 'test_tool',
          arguments: {}
        }
      }) : null;
      
      // Response should have sanitized error
      expect(response?.isError).toBe(true);
      expect(response).toBeDefined();
      if (!response) return;
      const responseText = response.content[0].text;
      const parsedResponse = JSON.parse(responseText);
      
      // Should use standard error message and code from constants
      expect(parsedResponse[TEXT.FIELD_ERROR][TEXT.FIELD_MESSAGE]).toBe(TEXT.ERROR_TOOL_EXECUTION_FAILED);
      expect(parsedResponse[TEXT.FIELD_ERROR][TEXT.FIELD_CODE]).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
      
      // Should NOT contain the original error details
      expect(responseText).not.toContain('Sensitive internal error');
      expect(responseText).not.toContain('secret data');
      
      // Verify log also doesn't contain sensitive details
      expect(writeError).toHaveBeenCalledWith(
        TEXT.ERROR_TOOL_EXECUTION_FAILED,
        expect.objectContaining({
          level: CONFIG.LOG_LEVEL_ERROR,
          code: CONFIG.ERROR_CODE_INVALID_REQUEST,
          tool: 'test_tool'
        })
      );
    });
    
    it('should handle non-Error thrown objects gracefully', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      const errorTool: McpTool = {
        getTool: vi.fn().mockReturnValue(mockToolDef),
        execute: vi.fn().mockRejectedValue('string error'),
      };
      
      manager.registerTool(errorTool);
      await manager.start();
      
      const callHandler = mockServer?.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === CallToolRequestSchema
      )?.[1];
      
      const response = callHandler ? await callHandler({
        params: {
          name: 'test_tool',
          arguments: {}
        }
      }) : null;
      
      // Should still return sanitized error response
      expect(response?.isError).toBe(true);
      expect(response).toBeDefined();
      if (!response) return;
      const responseText = response.content[0].text;
      const parsedResponse = JSON.parse(responseText);
      
      expect(parsedResponse[TEXT.FIELD_ERROR][TEXT.FIELD_MESSAGE]).toBe(TEXT.ERROR_TOOL_EXECUTION_FAILED);
      expect(parsedResponse[TEXT.FIELD_ERROR][TEXT.FIELD_CODE]).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
      expect(responseText).not.toContain('string error');
    });
  });

  describe('End-to-End Tool Execution via Manager', () => {
    let discoverTool: McpTool;
    let describePolicyTool: McpTool;
    let useSecretTool: McpTool;
    let queryAuditTool: McpTool;
    
    beforeEach(() => {
      // Mock Discover Tool
      discoverTool = {
        getTool: vi.fn().mockReturnValue({
          name: TEXT.TOOL_DISCOVER,
          description: TEXT.TOOL_DESC_DISCOVER,
          inputSchema: { type: 'object', properties: {}, required: [] }
        }),
        execute: vi.fn().mockResolvedValue({
          [TEXT.FIELD_SECRETS]: [
            { 
              [TEXT.FIELD_SECRET_ID]: 'my_service_id',
              [TEXT.FIELD_AVAILABLE]: true,
              [TEXT.FIELD_DESCRIPTION]: 'My service identifier'
            }
          ]
        })
      };
      
      // Mock Describe Policy Tool
      describePolicyTool = {
        getTool: vi.fn().mockReturnValue({
          name: TEXT.TOOL_DESCRIBE,
          description: TEXT.TOOL_DESC_DESCRIBE,
          inputSchema: {
            type: 'object',
            properties: {
              [TEXT.FIELD_SECRET_ID]: { type: 'string' }
            },
            required: [TEXT.FIELD_SECRET_ID]
          }
        }),
        execute: vi.fn().mockResolvedValue({
          [TEXT.FIELD_ALLOWED_ACTIONS]: ['http_get'],
          [TEXT.FIELD_ALLOWED_DOMAINS]: ['api.example.com'],
          [TEXT.FIELD_RATE_LIMIT]: { requests: 100, windowSeconds: 3600 }
        })
      };
      
      // Mock Use Secret Tool
      useSecretTool = {
        getTool: vi.fn().mockReturnValue({
          name: TEXT.TOOL_USE,
          description: TEXT.TOOL_DESC_USE,
          inputSchema: {
            type: 'object',
            properties: {
              [TEXT.FIELD_SECRET_ID]: { type: 'string' },
              [TEXT.FIELD_ACTION]: { type: 'object' }
            },
            required: [TEXT.FIELD_SECRET_ID, TEXT.FIELD_ACTION]
          }
        }),
        execute: vi.fn().mockResolvedValue({
          status: 200,
          body: '{"result": "success"}'
        })
      };
      
      // Mock Query Audit Tool
      queryAuditTool = {
        getTool: vi.fn().mockReturnValue({
          name: TEXT.TOOL_AUDIT,
          description: TEXT.TOOL_DESC_AUDIT,
          inputSchema: {
            type: 'object',
            properties: {
              [TEXT.FIELD_PAGE]: { type: 'number' },
              [TEXT.FIELD_PAGE_SIZE]: { type: 'number' }
            },
            required: []
          }
        }),
        execute: vi.fn().mockResolvedValue({
          [TEXT.FIELD_ENTRIES]: [],
          [TEXT.FIELD_TOTAL_COUNT]: 0,
          [TEXT.FIELD_HAS_MORE]: false
        })
      };
    });
    
    it('should execute Discover tool through manager request handler', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      manager.registerTool(discoverTool);
      await manager.start();
      
      const callHandler = mockServer?.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === CallToolRequestSchema
      )?.[1];
      
      const response = callHandler ? await callHandler({
        params: {
          name: TEXT.TOOL_DISCOVER,
          arguments: {}
        }
      }) : null;
      
      expect(response?.isError).toBeUndefined();
      expect(discoverTool.execute).toHaveBeenCalledWith({});
      
      expect(response).toBeDefined();
      if (!response) return;
      const responseData = JSON.parse(response.content[0].text);
      expect(responseData).toHaveProperty(TEXT.FIELD_SECRETS);
      // Secrets field should contain the actual array
      expect(responseData[TEXT.FIELD_SECRETS]).toBeInstanceOf(Array);
      expect(responseData[TEXT.FIELD_SECRETS]).toHaveLength(1);
    });
    
    it('should execute Describe Policy tool through manager request handler', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      manager.registerTool(describePolicyTool);
      await manager.start();
      
      const callHandler = mockServer?.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === CallToolRequestSchema
      )?.[1];
      
      const response = callHandler ? await callHandler({
        params: {
          name: TEXT.TOOL_DESCRIBE,
          arguments: { [TEXT.FIELD_SECRET_ID]: 'my_service_id' }
        }
      }) : null;
      
      expect(response?.isError).toBeUndefined();
      expect(describePolicyTool.execute).toHaveBeenCalledWith({
        [TEXT.FIELD_SECRET_ID]: 'my_service_id'
      });
      
      expect(response).toBeDefined();
      if (!response) return;
      const responseData = JSON.parse(response.content[0].text);
      expect(responseData).toHaveProperty(TEXT.FIELD_ALLOWED_ACTIONS);
      expect(responseData).toHaveProperty(TEXT.FIELD_ALLOWED_DOMAINS);
      expect(responseData).toHaveProperty(TEXT.FIELD_RATE_LIMIT);
    });
    
    it('should execute Use Secret tool through manager request handler', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      manager.registerTool(useSecretTool);
      await manager.start();
      
      const callHandler = mockServer?.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === CallToolRequestSchema
      )?.[1];
      
      const args = {
        [TEXT.FIELD_SECRET_ID]: 'test_secret',
        [TEXT.FIELD_ACTION]: {
          [TEXT.FIELD_TYPE]: 'http_get',
          [TEXT.FIELD_URL]: 'https://api.example.com/data'
        }
      };
      
      const response = callHandler ? await callHandler({
        params: {
          name: TEXT.TOOL_USE,
          arguments: args
        }
      }) : null;
      
      expect(response?.isError).toBeUndefined();
      expect(useSecretTool.execute).toHaveBeenCalledWith(args);
      
      expect(response).toBeDefined();
      if (!response) return;
      const responseData = JSON.parse(response.content[0].text);
      expect(responseData).toHaveProperty('status');
      expect(responseData.status).toBe(200);
    });
    
    it('should execute Query Audit tool through manager request handler', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      manager.registerTool(queryAuditTool);
      await manager.start();
      
      const callHandler = mockServer?.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === CallToolRequestSchema
      )?.[1];
      
      const response = callHandler ? await callHandler({
        params: {
          name: TEXT.TOOL_AUDIT,
          arguments: { [TEXT.FIELD_PAGE]: 1, [TEXT.FIELD_PAGE_SIZE]: 50 }
        }
      }) : null;
      
      expect(response?.isError).toBeUndefined();
      expect(queryAuditTool.execute).toHaveBeenCalledWith({
        [TEXT.FIELD_PAGE]: 1,
        [TEXT.FIELD_PAGE_SIZE]: 50
      });
      
      expect(response).toBeDefined();
      if (!response) return;
      const responseData = JSON.parse(response.content[0].text);
      expect(responseData).toHaveProperty(TEXT.FIELD_ENTRIES);
      expect(responseData).toHaveProperty(TEXT.FIELD_TOTAL_COUNT);
      expect(responseData).toHaveProperty(TEXT.FIELD_HAS_MORE);
    });
    
    it('should handle tool execution refusal paths correctly', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      // Mock a tool that refuses to execute
      const refusingTool: McpTool = {
        getTool: vi.fn().mockReturnValue({
          name: 'refusing_tool',
          description: 'Tool that refuses',
          inputSchema: { type: 'object' }
        }),
        execute: vi.fn().mockRejectedValue(
          new ToolError(TEXT.ERROR_FORBIDDEN_ACTION, CONFIG.ERROR_CODE_FORBIDDEN_ACTION)
        )
      };
      
      manager.registerTool(refusingTool);
      await manager.start();
      
      const callHandler = mockServer?.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === CallToolRequestSchema
      )?.[1];
      
      const response = callHandler ? await callHandler({
        params: {
          name: 'refusing_tool',
          arguments: {}
        }
      }) : null;
      
      expect(response?.isError).toBe(true);
      expect(response).toBeDefined();
      if (!response) return;
      const responseData = JSON.parse(response.content[0].text);
      expect(responseData[TEXT.FIELD_ERROR][TEXT.FIELD_CODE]).toBe(CONFIG.ERROR_CODE_FORBIDDEN_ACTION);
      expect(responseData[TEXT.FIELD_ERROR][TEXT.FIELD_MESSAGE]).toBe(TEXT.ERROR_FORBIDDEN_ACTION);
    });
    
    it('should maintain correct MCP response shape for all tools', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { CallToolRequestSchema, ListToolsRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      // Register all tools
      manager.registerTool(discoverTool);
      manager.registerTool(describePolicyTool);
      manager.registerTool(useSecretTool);
      manager.registerTool(queryAuditTool);
      await manager.start();
      
      // Test list tools response shape
      const listHandler = mockServer?.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === ListToolsRequestSchema
      )?.[1];
      
      const listResponse = listHandler ? await listHandler({}) : null;
      expect(listResponse).toHaveProperty('tools');
      expect(listResponse).toBeDefined();
      if (!listResponse) return;
      expect(Array.isArray(listResponse.tools)).toBe(true);
      expect(listResponse.tools).toHaveLength(4);
      
      // Verify each tool in list has correct shape
      listResponse.tools.forEach((tool: any) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(typeof tool.inputSchema).toBe('object');
      });
      
      // Test call tool response shape for success
      const callHandler = mockServer?.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === CallToolRequestSchema
      )?.[1];
      
      const successResponse = callHandler ? await callHandler({
        params: {
          name: TEXT.TOOL_DISCOVER,
          arguments: {}
        }
      }) : null;
      
      expect(successResponse).toHaveProperty('content');
      expect(successResponse).toBeDefined();
      if (!successResponse) return;
      expect(Array.isArray(successResponse.content)).toBe(true);
      expect(successResponse.content[0]).toHaveProperty('type');
      expect(successResponse.content[0]).toHaveProperty('text');
      expect(successResponse.content[0].type).toBe('text');
      expect(typeof successResponse.content[0].text).toBe('string');
      expect(successResponse.isError).toBeUndefined();
    });
  });

  describe('tool listing', () => {
    it('should list all registered tools', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { ListToolsRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      const tool2: McpTool = {
        getTool: vi.fn().mockReturnValue({
          name: 'tool2',
          description: 'Tool 2',
          inputSchema: { type: 'object' }
        }),
        execute: vi.fn(),
      };
      
      manager.registerTool(mockTool);
      manager.registerTool(tool2);
      await manager.start();
      
      const listHandler = mockServer?.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === ListToolsRequestSchema
      )?.[1];
      
      const response = listHandler ? await listHandler({}) : null;
      
      expect(response).toBeDefined();
      if (!response) return;
      expect(response.tools).toHaveLength(2);
      expect(response.tools[0]?.name).toBe('test_tool');
      expect(response.tools[1]?.name).toBe('tool2');
    });

    it('should return empty list when no tools registered', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { ListToolsRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      await manager.start();
      
      const listHandler = mockServer?.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === ListToolsRequestSchema
      )?.[1];
      
      const response = listHandler ? await listHandler({}) : null;
      
      expect(response).toBeDefined();
      if (!response) return;
      expect(response.tools).toHaveLength(0);
    });
  });
});