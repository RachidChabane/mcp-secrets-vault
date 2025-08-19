import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { McpServerManager } from '../services/mcp-server-manager.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';

// Mock process.exit to prevent test runner from exiting
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit called');
});

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

describe('Graceful Shutdown', () => {
  let serverManager: McpServerManager;
  let originalProcessOn: typeof process.on;
  let processListeners: Map<string, Function[]>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExit.mockClear();
    
    serverManager = new McpServerManager();
    
    // Store original process.on
    originalProcessOn = process.on;
    
    // Track registered listeners
    processListeners = new Map();
    
    // Mock process.on to capture listeners
    process.on = vi.fn((event: string, listener: Function) => {
      if (!processListeners.has(event)) {
        processListeners.set(event, []);
      }
      processListeners.get(event)!.push(listener);
      return process;
    }) as any;
  });

  afterEach(() => {
    // Restore original process.on
    process.on = originalProcessOn;
    processListeners.clear();
  });

  describe('Shutdown Handler Registration', () => {
    it('should register SIGINT and SIGTERM handlers on start', async () => {
      await serverManager.start();
      
      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should execute custom shutdown handlers', async () => {
      const customHandler1 = vi.fn().mockResolvedValue(undefined);
      const customHandler2 = vi.fn().mockResolvedValue(undefined);
      
      serverManager.registerShutdownHandler(customHandler1);
      serverManager.registerShutdownHandler(customHandler2);
      
      await serverManager.start();
      
      // Get the SIGINT handler
      const sigintHandler = processListeners.get('SIGINT')?.[0];
      expect(sigintHandler).toBeDefined();
      
      // Execute shutdown
      try {
        if (sigintHandler) {
        await sigintHandler();
      }
      } catch (error) {
        // Expected due to mocked process.exit
      }
      
      expect(customHandler1).toHaveBeenCalled();
      expect(customHandler2).toHaveBeenCalled();
    });

    it('should close server on shutdown', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const mockServer = (Server as unknown as Mock).mock.results[0].value;
      
      await serverManager.start();
      
      const sigintHandler = processListeners.get('SIGINT')?.[0];
      
      try {
        if (sigintHandler) {
        await sigintHandler();
      }
      } catch (error) {
        // Expected
      }
      
      expect(mockServer.close).toHaveBeenCalled();
    });

    it('should log shutdown message', async () => {
      const { writeError } = await import('../utils/logging.js');
      
      await serverManager.start();
      
      const sigtermHandler = processListeners.get('SIGTERM')?.[0];
      
      try {
        if (sigtermHandler) {
        await sigtermHandler();
      }
      } catch (error) {
        // Expected
      }
      
      expect(writeError).toHaveBeenCalledWith(
        TEXT.LOG_SERVER_STOPPED,
        { level: 'INFO' }
      );
    });

    it('should exit with success code', async () => {
      await serverManager.start();
      
      const sigintHandler = processListeners.get('SIGINT')?.[0];
      
      try {
        if (sigintHandler) {
        await sigintHandler();
      }
      } catch (error) {
        // Expected
      }
      
      expect(mockExit).toHaveBeenCalledWith(CONFIG.EXIT_CODE_SUCCESS);
    });
  });

  describe('Shutdown Handler Order', () => {
    it('should execute handlers in registration order', async () => {
      const executionOrder: number[] = [];
      
      const handler1 = vi.fn(async () => {
        executionOrder.push(1);
      });
      
      const handler2 = vi.fn(async () => {
        executionOrder.push(2);
      });
      
      const handler3 = vi.fn(async () => {
        executionOrder.push(3);
      });
      
      serverManager.registerShutdownHandler(handler1);
      serverManager.registerShutdownHandler(handler2);
      serverManager.registerShutdownHandler(handler3);
      
      await serverManager.start();
      
      const sigintHandler = processListeners.get('SIGINT')?.[0];
      
      try {
        if (sigintHandler) {
        await sigintHandler();
      }
      } catch (error) {
        // Expected
      }
      
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('should handle errors in shutdown handlers gracefully', async () => {
      const handler1 = vi.fn().mockRejectedValue(new Error('Handler 1 error'));
      const handler2 = vi.fn().mockResolvedValue(undefined);
      
      serverManager.registerShutdownHandler(handler1);
      serverManager.registerShutdownHandler(handler2);
      
      await serverManager.start();
      
      const sigintHandler = processListeners.get('SIGINT')?.[0];
      
      // Should not throw despite handler1 error
      try {
        if (sigintHandler) {
        await sigintHandler();
      }
      } catch (error: any) {
        // Should only be process.exit error
        expect(error.message).toBe('process.exit called');
      }
      
      // Both handlers should be called
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('Multiple Shutdown Signals', () => {
    it('should handle multiple shutdown signals gracefully', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const mockServer = (Server as unknown as Mock).mock.results[0].value;
      
      await serverManager.start();
      
      const sigintHandler = processListeners.get('SIGINT')?.[0];
      const sigtermHandler = processListeners.get('SIGTERM')?.[0];
      
      // First signal
      try {
        if (sigintHandler) {
        await sigintHandler();
      }
      } catch (error) {
        // Expected
      }
      
      // Second signal (should be idempotent)
      try {
        if (sigtermHandler) {
        await sigtermHandler();
      }
      } catch (error) {
        // Expected
      }
      
      // Server close should only be called once
      expect(mockServer.close).toHaveBeenCalledTimes(1);
    });
  });
});