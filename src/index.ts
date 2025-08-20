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
import { JsonlAuditService } from './services/audit-service.js';
import { McpServerManager } from './services/mcp-server-manager.js';
import { ConfigLoaderService } from './services/config-loader.service.js';
import { writeError, writeInfo } from './utils/logging.js';


async function loadConfiguration() {
  const configLoader = new ConfigLoaderService();
  
  try {
    const config = await configLoader.loadConfig();
    writeInfo(`Configuration loaded: ${config.mappings.length} mappings, ${config.policies.length} policies`);
    return config;
  } catch (error: any) {
    writeError(`Failed to load configuration: ${error.message}`, {
      level: CONFIG.LOG_LEVEL_ERROR,
      code: CONFIG.ERROR_CODE_INVALID_REQUEST
    });
    throw error;
  }
}

async function createServices(config: Awaited<ReturnType<typeof loadConfiguration>>) {
  const secretProvider = new EnvSecretProvider(config.mappings);
  const policyProvider = new PolicyProviderService();
  const actionExecutor = new HttpActionExecutor();
  const rateLimiter = new RateLimiterService();
  
  // Initialize audit service with config settings
  const auditService = new JsonlAuditService(
    config.settings?.auditDir || CONFIG.DEFAULT_AUDIT_DIR,
    {
      maxSizeMB: config.settings?.maxFileSizeMb,
      maxAgeDays: config.settings?.maxFileAgeDays
    }
  );
  
  await auditService.initialize();
  
  // Load policies from config instead of file
  await policyProvider.loadPoliciesFromConfig(config.policies);
  
  // Set default rate limit if provided
  if (config.settings?.defaultRateLimit) {
    rateLimiter.setDefaultLimit(
      config.settings.defaultRateLimit.requests,
      config.settings.defaultRateLimit.windowSeconds
    );
  }
  
  return { secretProvider, policyProvider, actionExecutor, rateLimiter, auditService };
}

function createTools(services: Awaited<ReturnType<typeof createServices>>) {
  const { secretProvider, policyProvider, actionExecutor, rateLimiter, auditService } = services;
  
  return {
    discoverTool: new DiscoverTool(secretProvider),
    describePolicyTool: new DescribePolicyTool(policyProvider),
    useSecretTool: new UseSecretTool(secretProvider, policyProvider, actionExecutor, rateLimiter, auditService),
    queryAuditTool: new QueryAuditTool(auditService)
  };
}

async function main(): Promise<void> {
  const serverManager = new McpServerManager();
  
  try {
    const config = await loadConfiguration();
    const services = await createServices(config);
    const tools = createTools(services);
    
    Object.values(tools).forEach(tool => serverManager.registerTool(tool));
    
    serverManager.registerShutdownHandler(async () => {
      await services.auditService.close();
    });
    
    await serverManager.start();
  } catch (error) {
    writeError('Failed to start server', {
      level: CONFIG.LOG_LEVEL_ERROR,
      code: CONFIG.ERROR_CODE_INVALID_REQUEST
    });
    process.exit(CONFIG.EXIT_CODE_INVALID_CONFIG);
  }
}

if (import.meta.url === `${CONFIG.FILE_URL_SCHEME}${process.argv[1]}`) {
  // Check if running doctor command
  const args = process.argv.slice(2);
  if (args[0] === 'doctor') {
    // Import and run doctor CLI
    import('./cli/doctor.js').then(({ DoctorCLI }) => {
      const doctor = new DoctorCLI(args[1]);
      return doctor.run();
    }).catch(() => {
      writeError(TEXT.DOCTOR_CLI_FAILED, {
        level: CONFIG.LOG_LEVEL_ERROR,
        code: CONFIG.ERROR_CODE_INVALID_REQUEST
      });
      process.exit(CONFIG.EXIT_CODE_ERROR);
    });
  } else {
    // Run MCP server normally
    main().catch(() => {
      writeError(TEXT.ERROR_INVALID_CONFIG, { 
        level: CONFIG.LOG_LEVEL_ERROR,
        code: CONFIG.ERROR_CODE_INVALID_REQUEST
      });
      process.exit(CONFIG.EXIT_CODE_ERROR);
    });
  }
}

export { main };