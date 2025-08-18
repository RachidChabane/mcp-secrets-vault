#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { CONFIG } from './constants/config-constants.js';
import { TEXT } from './constants/text-constants.js';
import { EnvSecretProvider } from './services/env-secret-provider.js';
import { DiscoverTool } from './tools/discover-tool.js';
import { SecretMapping } from './interfaces/secret-mapping.interface.js';
import { writeError } from './utils/logging.js';
import { ToolError } from './utils/errors.js';

async function loadMappings(): Promise<SecretMapping[]> {
  // TODO: Load from configuration file
  // For now, return empty array or test mappings from env
  const mappings: SecretMapping[] = [];
  
  // Example: Check for test mappings in env
  if (process.env['TEST_SECRET_MAPPINGS']) {
    try {
      return JSON.parse(process.env['TEST_SECRET_MAPPINGS']);
    } catch (error) {
      writeError(TEXT.ERROR_INVALID_CONFIG, { 
        level: 'ERROR',
        code: CONFIG.ERROR_CODE_INVALID_REQUEST 
      });
    }
  }
  
  return mappings;
}

function extractErrorDetails(error: unknown): { code: string; message: string } {
  if (error instanceof ToolError) {
    return { code: error.code, message: error.message };
  }
  return { 
    code: CONFIG.ERROR_CODE_INVALID_REQUEST, 
    message: TEXT.ERROR_TOOL_EXECUTION_FAILED 
  };
}

function createErrorResponse(
  error: unknown, 
  toolName: string
): { content: Array<{ type: string; text: string }>; isError: boolean } {
  const { code, message } = extractErrorDetails(error);
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

function createSuccessResponse(
  result: unknown
): { content: Array<{ type: string; text: string }> } {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result, null, 2),
    }],
  };
}

async function executeTool(
  name: string, 
  args: unknown,
  discoverTool: DiscoverTool
): Promise<unknown> {
  switch (name) {
    case TEXT.TOOL_DISCOVER:
      return await discoverTool.execute(args);
    default:
      throw new ToolError(
        TEXT.ERROR_UNKNOWN_TOOL,
        CONFIG.ERROR_CODE_UNKNOWN_TOOL
      );
  }
}

async function main(): Promise<void> {
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

  // Load mappings and initialize provider
  const mappings = await loadMappings();
  const secretProvider = new EnvSecretProvider(mappings);
  
  // Initialize tools
  const discoverTool = new DiscoverTool(secretProvider);
  
  // Register tool listing handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      discoverTool.getTool(),
    ],
  }));

  // Register tool execution handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      const result = await executeTool(name, args, discoverTool);
      return createSuccessResponse(result);
    } catch (error) {
      return createErrorResponse(error, name);
    }
  });

  // Setup transport
  const transport = new StdioServerTransport();
  
  // Connect server to transport
  await server.connect(transport);
  
  // Log startup
  writeError(TEXT.LOG_SERVER_STARTED, {
    level: 'INFO',
    version: CONFIG.VERSION
  });
  
  // Handle shutdown signals
  const shutdown = async () => {
    writeError(TEXT.LOG_SERVER_STOPPED, { level: 'INFO' });
    await server.close();
    process.exit(CONFIG.EXIT_CODE_SUCCESS);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(() => {
    writeError(TEXT.ERROR_INVALID_CONFIG, { 
      level: 'ERROR',
      code: CONFIG.ERROR_CODE_INVALID_REQUEST
    });
    process.exit(CONFIG.EXIT_CODE_ERROR);
  });
}

export { main };