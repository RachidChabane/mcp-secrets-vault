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

    it('should allow multiple tool registrations', () => {
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
      const mockServer = (Server as unknown as Mock).mock.results[0].value;
      
      await manager.start();
      
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(2);
      expect(mockServer.connect).toHaveBeenCalled();
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
      const mockServer = (Server as unknown as Mock).mock.results[0].value;
      
      manager.registerTool(mockTool);
      await manager.start();
      
      // Get the CallToolRequestSchema handler
      const callHandler = mockServer.setRequestHandler.mock.calls.find(
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
      expect(response.isError).toBeUndefined();
    });

    it('should handle unknown tool error', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const mockServer = (Server as unknown as Mock).mock.results[0].value;
      
      await manager.start();
      
      const callHandler = mockServer.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === CallToolRequestSchema
      )?.[1];
      
      const response = callHandler ? await callHandler({
        params: {
          name: 'unknown_tool',
          arguments: {}
        }
      }) : null;
      
      expect(response?.isError).toBe(true);
      expect(response?.content[0].text).toContain(TEXT.ERROR_UNKNOWN_TOOL);
      expect(response?.content[0].text).toContain(CONFIG.ERROR_CODE_UNKNOWN_TOOL);
    });

    it('should handle tool execution errors', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const mockServer = (Server as unknown as Mock).mock.results[0].value;
      
      const errorTool: McpTool = {
        getTool: vi.fn().mockReturnValue(mockToolDef),
        execute: vi.fn().mockRejectedValue(
          new ToolError('Custom error', 'CUSTOM_CODE')
        ),
      };
      
      manager.registerTool(errorTool);
      await manager.start();
      
      const callHandler = mockServer.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === CallToolRequestSchema
      )?.[1];
      
      const response = callHandler ? await callHandler({
        params: {
          name: 'test_tool',
          arguments: {}
        }
      }) : null;
      
      expect(response?.isError).toBe(true);
      expect(response?.content[0].text).toContain('Custom error');
      expect(response?.content[0].text).toContain('CUSTOM_CODE');
    });
  });

  describe('tool listing', () => {
    it('should list all registered tools', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { ListToolsRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const mockServer = (Server as unknown as Mock).mock.results[0].value;
      
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
      
      const listHandler = mockServer.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === ListToolsRequestSchema
      )?.[1];
      
      const response = listHandler ? await listHandler({}) : null;
      
      expect(response?.tools).toHaveLength(2);
      expect(response?.tools[0]?.name).toBe('test_tool');
      expect(response?.tools[1]?.name).toBe('tool2');
    });

    it('should return empty list when no tools registered', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { ListToolsRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const mockServer = (Server as unknown as Mock).mock.results[0].value;
      
      await manager.start();
      
      const listHandler = mockServer.setRequestHandler.mock.calls.find(
        (call: any[]) => call[0] === ListToolsRequestSchema
      )?.[1];
      
      const response = listHandler ? await listHandler({}) : null;
      
      expect(response?.tools).toHaveLength(0);
    });
  });
});