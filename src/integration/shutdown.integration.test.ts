import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { McpServerManager } from '../services/mcp-server-manager.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';

// Mock process.exit to prevent test runner from exiting
let mockExit: any;

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
    
    // Set up process.exit mock
    mockExit = vi.spyOn(process, 'exit').mockImplementation((_code?: string | number | null | undefined) => {
      // Don't actually exit, just record the call
      return undefined as never;
    });
    
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
    // Restore process.exit
    mockExit?.mockRestore();
    vi.clearAllMocks();
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
      if (sigintHandler) {
        await sigintHandler();
      }
      
      expect(customHandler1).toHaveBeenCalled();
      expect(customHandler2).toHaveBeenCalled();
    });

    it('should close server on shutdown', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      await serverManager.start();
      
      const sigintHandler = processListeners.get('SIGINT')?.[0];
      
      if (sigintHandler) {
        await sigintHandler();
      }
      
      expect(mockServer?.close).toHaveBeenCalled();
    });

    it('should log shutdown message', async () => {
      const { writeError } = await import('../utils/logging.js');
      
      await serverManager.start();
      
      const sigtermHandler = processListeners.get('SIGTERM')?.[0];
      
      if (sigtermHandler) {
        await sigtermHandler();
      }
      
      expect(writeError).toHaveBeenCalledWith(
        TEXT.LOG_SERVER_STOPPED,
        { level: CONFIG.LOG_LEVEL_INFO }
      );
    });

    it('should exit with success code', async () => {
      await serverManager.start();
      
      const sigintHandler = processListeners.get('SIGINT')?.[0];
      
      mockExit.mockClear(); // Clear any previous calls
      
      if (sigintHandler) {
        await sigintHandler();
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
      
      if (sigintHandler) {
        await sigintHandler();
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
      
      // Execute shutdown - errors in handlers should be caught internally
      if (sigintHandler) {
        await sigintHandler();
      }
      
      // Both handlers should be called despite error in first
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(CONFIG.EXIT_CODE_SUCCESS);
    });
  });

  describe('Multiple Shutdown Signals', () => {
    it('should handle multiple shutdown signals gracefully (idempotence)', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { writeError } = await import('../utils/logging.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      const customHandler = vi.fn().mockResolvedValue(undefined);
      serverManager.registerShutdownHandler(customHandler);
      
      await serverManager.start();
      
      const sigintHandler = processListeners.get('SIGINT')?.[0];
      const sigtermHandler = processListeners.get('SIGTERM')?.[0];
      
      // Clear previous log calls from start
      (writeError as Mock).mockClear();
      mockServer.close.mockClear();
      mockExit.mockClear();
      
      // First signal
      if (sigintHandler) {
        await sigintHandler();
      }
      
      // Verify first shutdown executed
      expect(mockServer?.close).toHaveBeenCalledTimes(1);
      expect(customHandler).toHaveBeenCalledTimes(1);
      expect(writeError).toHaveBeenCalledTimes(1);
      expect(writeError).toHaveBeenCalledWith(
        TEXT.LOG_SERVER_STOPPED,
        { level: CONFIG.LOG_LEVEL_INFO }
      );
      expect(mockExit).toHaveBeenCalledTimes(1);
      
      // Clear mocks for second signal
      mockServer.close.mockClear();
      customHandler.mockClear();
      (writeError as Mock).mockClear();
      mockExit.mockClear();
      
      // Second signal (should be idempotent - no operations)
      if (sigtermHandler) {
        await sigtermHandler();
      }
      
      // Verify no duplicate operations
      expect(mockServer?.close).toHaveBeenCalledTimes(0);
      expect(customHandler).toHaveBeenCalledTimes(0);
      expect(writeError).toHaveBeenCalledTimes(0);
      expect(mockExit).toHaveBeenCalledTimes(0);
    });
    
    it('should handle rapid concurrent shutdown signals', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const mockServer = (Server as unknown as Mock).mock.results[0]?.value;
      
      const customHandler = vi.fn().mockResolvedValue(undefined);
      serverManager.registerShutdownHandler(customHandler);
      
      await serverManager.start();
      
      const sigintHandler = processListeners.get('SIGINT')?.[0];
      
      // Clear previous calls
      mockServer.close.mockClear();
      customHandler.mockClear();
      mockExit.mockClear();
      
      // Send multiple signals concurrently
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          sigintHandler ? sigintHandler() : Promise.resolve()
        );
      }
      
      await Promise.all(promises);
      
      // Should only execute shutdown once despite multiple concurrent calls
      expect(mockServer?.close).toHaveBeenCalledTimes(1);
      expect(customHandler).toHaveBeenCalledTimes(1);
      expect(mockExit).toHaveBeenCalledTimes(1);
    });
  });
});