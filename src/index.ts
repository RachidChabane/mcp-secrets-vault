#!/usr/bin/env node

import { CONFIG } from './constants/config-constants.js';
import { TEXT } from './constants/text-constants.js';
import { EnvSecretProvider } from './services/env-secret-provider.js';
import { PolicyProviderService } from './services/policy-provider.service.js';
import { HttpActionExecutor } from './services/http-action-executor.service.js';
import { RateLimiterService } from './services/rate-limiter.service.js';
import { DiscoverTool } from './tools/discover-tool.js';
import { DescribePolicyTool } from './tools/describe-policy-tool.js';
import { UseSecretTool } from './tools/use-secret-tool.js';
import { QueryAuditTool } from './tools/query-audit-tool.js';
import { SecretMapping } from './interfaces/secret-mapping.interface.js';
import { JsonlAuditService } from './services/audit-service.js';
import { McpServerManager } from './services/mcp-server-manager.js';
import { writeError } from './utils/logging.js';

async function loadMappings(): Promise<SecretMapping[]> {
  // TODO: Load from configuration file
  // For now, return empty array or test mappings from env
  const mappings: SecretMapping[] = [];
  
  // Example: Check for test mappings in env
  const testMappings = process.env[CONFIG.ENV_TEST_SECRET_MAPPINGS];
  if (testMappings) {
    try {
      return JSON.parse(testMappings);
    } catch (error) {
      writeError(TEXT.ERROR_INVALID_CONFIG, { 
        level: CONFIG.LOG_LEVEL_ERROR,
        code: CONFIG.ERROR_CODE_INVALID_REQUEST 
      });
    }
  }
  
  return mappings;
}


async function createServices(mappings: SecretMapping[]) {
  const secretProvider = new EnvSecretProvider(mappings);
  const policyProvider = new PolicyProviderService();
  const actionExecutor = new HttpActionExecutor();
  const rateLimiter = new RateLimiterService();
  const auditService = new JsonlAuditService();
  
  await auditService.initialize();
  await policyProvider.loadPolicies();
  
  return { secretProvider, policyProvider, actionExecutor, rateLimiter, auditService };
}

function createTools(services: Awaited<ReturnType<typeof createServices>>) {
  const { secretProvider, policyProvider, actionExecutor, rateLimiter, auditService } = services;
  
  return {
    discoverTool: new DiscoverTool(secretProvider),
    describePolicyTool: new DescribePolicyTool(policyProvider),
    useSecretTool: new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter),
    queryAuditTool: new QueryAuditTool(auditService)
  };
}

async function main(): Promise<void> {
  const serverManager = new McpServerManager();
  const mappings = await loadMappings();
  const services = await createServices(mappings);
  const tools = createTools(services);
  
  Object.values(tools).forEach(tool => serverManager.registerTool(tool));
  
  serverManager.registerShutdownHandler(async () => {
    await services.auditService.close();
  });
  
  await serverManager.start();
}

if (import.meta.url === `${CONFIG.FILE_URL_SCHEME}${process.argv[1]}`) {
  main().catch(() => {
    writeError(TEXT.ERROR_INVALID_CONFIG, { 
      level: CONFIG.LOG_LEVEL_ERROR,
      code: CONFIG.ERROR_CODE_INVALID_REQUEST
    });
    process.exit(CONFIG.EXIT_CODE_ERROR);
  });
}

export { main };