#!/usr/bin/env node

import { CONFIG } from './constants/config-constants.js';
import { TEXT } from './constants/text-constants.js';

async function main(): Promise<void> {
  console.log(`${TEXT.LOG_SERVER_STARTED} - ${CONFIG.SERVER_NAME} v${CONFIG.VERSION}`);
  
  // TODO: Initialize MCP server
  // TODO: Register tools
  // TODO: Start server
  
  process.on('SIGINT', () => {
    console.log(`\n${TEXT.LOG_SERVER_STOPPED}`);
    process.exit(CONFIG.EXIT_CODE_SUCCESS);
  });
  
  process.on('SIGTERM', () => {
    console.log(`\n${TEXT.LOG_SERVER_STOPPED}`);
    process.exit(CONFIG.EXIT_CODE_SUCCESS);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(CONFIG.EXIT_CODE_ERROR);
  });
}

export { main };