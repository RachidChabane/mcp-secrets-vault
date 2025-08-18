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
      switch (name) {
        case TEXT.TOOL_DISCOVER: {
          const result = await discoverTool.execute(args);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }
        
        default:
          throw new ToolError(
            TEXT.ERROR_UNKNOWN_TOOL,
            CONFIG.ERROR_CODE_UNKNOWN_TOOL
          );
      }
    } catch (error) {
      let errorCode: string = CONFIG.ERROR_CODE_INVALID_REQUEST;
      let errorMessage: string = TEXT.ERROR_TOOL_EXECUTION_FAILED;
      
      if (error instanceof ToolError) {
        errorCode = error.code;
        errorMessage = error.message;
      }
      
      writeError(errorMessage, { 
        level: 'ERROR',
        code: errorCode,
        tool: name
      });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              [TEXT.FIELD_ERROR]: {
                [TEXT.FIELD_CODE]: errorCode,
                [TEXT.FIELD_MESSAGE]: errorMessage
              }
            }, null, 2),
          },
        ],
        isError: true,
      };
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