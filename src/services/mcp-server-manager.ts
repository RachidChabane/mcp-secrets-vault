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
import { ToolError } from '../utils/errors.js';

export interface McpTool {
  getTool(): Tool;
  execute(args: unknown): Promise<unknown>;
}

export class McpServerManager {
  private readonly server: Server;
  private readonly transport: StdioServerTransport;
  private readonly toolRegistry: Map<string, McpTool>;
  private shutdownHandlers: Array<() => Promise<void>> = [];

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
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  }

  private createErrorResponse(error: unknown, toolName: string) {
    const { code, message } = this.extractErrorDetails(error);
    writeError(message, { level: 'ERROR', code, tool: toolName });
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          [TEXT.FIELD_ERROR]: {
            [TEXT.FIELD_CODE]: code,
            [TEXT.FIELD_MESSAGE]: message
          }
        }, null, 2),
      }],
      isError: true,
    };
  }

  private extractErrorDetails(error: unknown): { code: string; message: string } {
    if (error instanceof ToolError) {
      return { code: error.code, message: error.message };
    }
    return { 
      code: CONFIG.ERROR_CODE_INVALID_REQUEST, 
      message: TEXT.ERROR_TOOL_EXECUTION_FAILED 
    };
  }

  async start(): Promise<void> {
    this.setupRequestHandlers();
    await this.server.connect(this.transport);
    
    writeError(TEXT.LOG_SERVER_STARTED, {
      level: 'INFO',
      version: CONFIG.VERSION
    });
    
    this.setupShutdownHandlers();
  }

  private setupShutdownHandlers(): void {
    const shutdown = async () => {
      writeError(TEXT.LOG_SERVER_STOPPED, { level: 'INFO' });
      
      // Execute all registered shutdown handlers
      for (const handler of this.shutdownHandlers) {
        await handler();
      }
      
      await this.server.close();
      process.exit(CONFIG.EXIT_CODE_SUCCESS);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}