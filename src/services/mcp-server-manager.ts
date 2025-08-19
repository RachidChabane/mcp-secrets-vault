import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  Tool 
} from '@modelcontextprotocol/sdk/types.js';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import { writeError } from '../utils/logging.js';
import { ToolError, sanitizeUnknownError } from '../utils/errors.js';
import { sanitizeResponse } from '../utils/security.js';

export interface McpTool {
  getTool(): Tool;
  execute(args: unknown): Promise<unknown>;
}

export class McpServerManager {
  private readonly server: Server;
  private readonly transport: StdioServerTransport;
  private readonly toolRegistry: Map<string, McpTool>;
  private shutdownHandlers: Array<() => Promise<void>> = [];
  private isShuttingDown = false;

  constructor() {
    this.server = new Server(
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
    
    this.transport = new StdioServerTransport();
    this.toolRegistry = new Map();
  }

  registerTool(tool: McpTool): void {
    const toolDef = tool.getTool();
    
    // Check for duplicate tool registration
    if (this.toolRegistry.has(toolDef.name)) {
      throw new ToolError(
        TEXT.ERROR_DUPLICATE_TOOL,
        CONFIG.ERROR_CODE_DUPLICATE_TOOL
      );
    }
    
    this.toolRegistry.set(toolDef.name, tool);
  }

  registerShutdownHandler(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler);
  }

  private setupRequestHandlers(): void {
    // Tool listing handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: Array.from(this.toolRegistry.values()).map(tool => tool.getTool()),
    }));

    // Tool execution handler with table-driven dispatch
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        const tool = this.toolRegistry.get(name);
        if (!tool) {
          throw new ToolError(
            TEXT.ERROR_UNKNOWN_TOOL,
            CONFIG.ERROR_CODE_UNKNOWN_TOOL
          );
        }
        
        const result = await tool.execute(args);
        return this.createSuccessResponse(result);
      } catch (error) {
        return this.createErrorResponse(error, name);
      }
    });
  }

  private createSuccessResponse(result: unknown) {
    // Deep sanitize and make immutable before serializing
    const sanitized = sanitizeResponse(result);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(sanitized, null, 2),
      }],
    };
  }

  private createErrorResponse(error: unknown, toolName: string) {
    // Sanitize error to ensure no sensitive data leaks
    const safeError = sanitizeUnknownError(error);
    const { code, message } = this.extractErrorDetails(safeError);
    
    writeError(message, { level: CONFIG.LOG_LEVEL_ERROR, code, tool: toolName });
    
    // Create sanitized error response
    const errorResponse = sanitizeResponse({
      [TEXT.FIELD_ERROR]: {
        [TEXT.FIELD_CODE]: code,
        [TEXT.FIELD_MESSAGE]: message
      }
    });
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(errorResponse, null, 2),
      }],
      isError: true,
    };
  }

  private extractErrorDetails(error: unknown): { code: string; message: string } {
    if (error instanceof ToolError) {
      // Already sanitized in constructor
      return { code: error.code, message: error.message };
    }
    // For unknown errors, use safe defaults
    return { 
      code: CONFIG.ERROR_CODE_INVALID_REQUEST, 
      message: TEXT.ERROR_TOOL_EXECUTION_FAILED 
    };
  }

  async start(): Promise<void> {
    this.setupRequestHandlers();
    await this.server.connect(this.transport);
    
    writeError(TEXT.LOG_SERVER_STARTED, {
      level: CONFIG.LOG_LEVEL_INFO,
      version: CONFIG.VERSION
    });
    
    this.setupShutdownHandlers();
  }

  private setupShutdownHandlers(): void {
    const shutdown = async () => {
      // Ensure idempotence - prevent multiple shutdown executions
      if (this.isShuttingDown) {
        return;
      }
      this.isShuttingDown = true;
      
      writeError(TEXT.LOG_SERVER_STOPPED, { level: CONFIG.LOG_LEVEL_INFO });
      
      // Execute all registered shutdown handlers
      for (const handler of this.shutdownHandlers) {
        try {
          await handler();
        } catch (error) {
          // Log but don't fail shutdown on handler errors
          writeError(TEXT.LOG_SHUTDOWN_HANDLER_ERROR, { 
            level: CONFIG.LOG_LEVEL_WARN,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      await this.server.close();
      process.exit(CONFIG.EXIT_CODE_SUCCESS);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}