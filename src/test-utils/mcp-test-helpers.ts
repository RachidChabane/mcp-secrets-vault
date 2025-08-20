import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  CallToolRequest,
  ListToolsRequest,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';
import { SecretMapping } from '../interfaces/secret-mapping.interface.js';
import { PolicyConfig } from '../interfaces/policy.interface.js';
import { AuditEntry } from '../interfaces/audit.interface.js';

/**
 * Create a mock MCP server for testing
 */
export function createMockMcpServer(
  name: string = CONFIG.SERVER_NAME,
  version: string = CONFIG.VERSION
): Server {
  return new Server(
    { name, version },
    { capabilities: { tools: {} } }
  );
}

/**
 * Create a test secret mapping
 */
export function createTestSecretMapping(
  id: string,
  envVar: string,
  description?: string
): SecretMapping {
  return {
    secretId: id,
    envVar,
    description: description || `Test ${id}`
  };
}

/**
 * Create a test policy configuration
 */
export function createTestPolicy(
  secretId: string,
  options: Partial<PolicyConfig> = {}
): PolicyConfig {
  return {
    secretId,
    allowedActions: options.allowedActions || ['http_get'],
    allowedDomains: options.allowedDomains || ['api.example.com'],
    rateLimit: options.rateLimit,
    expiresAt: options.expiresAt
  };
}

/**
 * Create a test audit entry
 */
export function createTestAuditEntry(
  secretId: string,
  action: string,
  outcome: 'success' | 'denied',
  reason: string
): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    secretId,
    action,
    outcome,
    reason
  };
}

/**
 * Build a CallToolRequest for testing
 */
export function buildCallToolRequest(
  toolName: string,
  args: Record<string, any> = {}
): CallToolRequest {
  return {
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args
    }
  };
}

/**
 * Build a ListToolsRequest for testing
 */
export function buildListToolsRequest(): ListToolsRequest {
  return {
    method: 'tools/list'
  };
}

/**
 * Create a mock tool definition
 */
export function createMockTool(
  name: string,
  description: string,
  inputSchema: any = { type: 'object' }
): Tool {
  return {
    name,
    description,
    inputSchema
  };
}

/**
 * Generate test data for large payload testing
 */
export function generateLargeTestData(count: number): SecretMapping[] {
  return Array.from({ length: count }, (_, i) => ({
    secretId: `secret_${i}`,
    envVar: `SECRET_${i}`,
    description: `Test secret ${i} with a longer description to increase payload size`
  }));
}

/**
 * Create a test environment with secrets
 */
export function setupTestEnvironment(secrets: Record<string, string>): void {
  Object.entries(secrets).forEach(([key, value]) => {
    process.env[key] = value;
  });
}

/**
 * Clean up test environment
 */
export function cleanupTestEnvironment(keys: string[]): void {
  keys.forEach(key => {
    delete process.env[key];
  });
}

/**
 * Create test response payload
 */
export function createTestResponse(
  content: any,
  isError: boolean = false
): { content: Array<{ type: string; text: string }>; isError?: boolean } {
  const response: { content: Array<{ type: string; text: string }>; isError?: boolean } = {
    content: [{
      type: 'text',
      text: typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    }]
  };
  
  if (isError) {
    response.isError = true;
  }
  
  return response;
}

/**
 * Create error response payload
 */
export function createErrorResponse(
  code: string,
  message: string
): { content: Array<{ type: string; text: string }>; isError: boolean } {
  const response = createTestResponse({
    [TEXT.FIELD_ERROR]: {
      [TEXT.FIELD_CODE]: code,
      [TEXT.FIELD_MESSAGE]: message
    }
  }, true);
  
  return response as { content: Array<{ type: string; text: string }>; isError: boolean };
}

/**
 * Normalize timestamps in audit entries for snapshot testing
 */
export function normalizeAuditTimestamps(
  entries: AuditEntry[],
  fixedTimestamp: string = '2024-01-01T00:00:00.000Z'
): AuditEntry[] {
  return entries.map(entry => ({
    ...entry,
    timestamp: fixedTimestamp
  }));
}

/**
 * Create a delay for testing async operations
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Assert that a value contains no sensitive data
 */
export function assertNoSensitiveData(
  value: any,
  sensitivePatterns: string[] = []
): void {
  const serialized = JSON.stringify(value);
  const defaultPatterns = [
    'envVar',
    'TEST_API_KEY',
    'TEST_DB_PASS',
    'test-secret-value',
    'db-secret-value',
    'Authorization',
    'Bearer'
  ];
  
  [...defaultPatterns, ...sensitivePatterns].forEach(pattern => {
    if (serialized.includes(pattern)) {
      throw new Error(`Sensitive data found: ${pattern}`);
    }
  });
}

/**
 * Create a mock HTTP response
 */
export function createMockHttpResponse(
  statusCode: number = 200,
  body: any = { success: true },
  headers: Record<string, string> = {}
): { statusCode: number; headers: Record<string, string>; body: any } {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body
  };
}

/**
 * Verify MCP protocol compliance for a tool
 */
export function verifyToolCompliance(tool: Tool): void {
  // Check required fields
  if (!tool.name || typeof tool.name !== 'string') {
    throw new Error('Tool must have a name');
  }
  
  if (!tool.description || typeof tool.description !== 'string') {
    throw new Error('Tool must have a description');
  }
  
  if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
    throw new Error('Tool must have an inputSchema');
  }
  
  // Check schema structure
  if (tool.inputSchema.type !== 'object') {
    throw new Error('Tool inputSchema must be of type object');
  }
}

/**
 * Create a batch of test requests for concurrent testing
 */
export function createTestRequestBatch(
  toolName: string,
  count: number,
  argsGenerator?: (index: number) => Record<string, any>
): CallToolRequest[] {
  return Array.from({ length: count }, (_, i) => 
    buildCallToolRequest(
      toolName,
      argsGenerator ? argsGenerator(i) : {}
    )
  );
}

/**
 * Compare two payloads for equality (ignoring timestamps)
 */
export function comparePayloads(
  payload1: any,
  payload2: any,
  ignoreFields: string[] = ['timestamp']
): boolean {
  const normalize = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(normalize);
    
    const normalized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!ignoreFields.includes(key)) {
        normalized[key] = normalize(value);
      }
    }
    return normalized;
  };
  
  return JSON.stringify(normalize(payload1)) === JSON.stringify(normalize(payload2));
}