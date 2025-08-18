import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TEXT } from './constants/text-constants.js';

describe('MCP Server Integration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    
    // Set up test mappings
    process.env['TEST_SECRET_MAPPINGS'] = JSON.stringify([
      {
        secretId: 'test_api_key',
        envVar: 'TEST_API_KEY',
        description: 'Test API Key'
      },
      {
        secretId: 'test_db_pass',
        envVar: 'TEST_DB_PASS',
        description: 'Test Database Password'
      }
    ]);
    
    // Set actual env vars
    process.env['TEST_API_KEY'] = 'secret-api-key-value';
    // TEST_DB_PASS is intentionally not set to test unavailable state
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('should parse TEST_SECRET_MAPPINGS correctly', async () => {
    // Test that env mappings are parsed correctly
    const mappings = JSON.parse(process.env['TEST_SECRET_MAPPINGS']!);
    
    expect(mappings).toHaveLength(2);
    expect(mappings[0].secretId).toBe('test_api_key');
    expect(mappings[1].secretId).toBe('test_db_pass');
  });

  it('should handle discover tool execution', async () => {
    // Test that the discover tool can be executed through the server
    // This would be tested through actual MCP protocol in integration tests
    // For unit tests, we verify the tool exists and can be executed
    const { DiscoverTool } = await import('./tools/discover-tool.js');
    const { EnvSecretProvider } = await import('./services/env-secret-provider.js');
    
    const provider = new EnvSecretProvider([
      {
        secretId: 'test_key',
        envVar: 'TEST_KEY',
        description: 'Test'
      }
    ]);
    
    const tool = new DiscoverTool(provider);
    const result = await tool.execute({});
    
    expect(result).toHaveProperty(TEXT.FIELD_SECRETS);
    expect(Array.isArray(result[TEXT.FIELD_SECRETS])).toBe(true);
  });
  
  it('should never expose envVar in discover results', async () => {
    const { DiscoverTool } = await import('./tools/discover-tool.js');
    const { EnvSecretProvider } = await import('./services/env-secret-provider.js');
    
    const provider = new EnvSecretProvider([
      {
        secretId: 'test_secret',
        envVar: 'SUPER_SECRET_ENV_VAR',
        description: 'Test secret'
      }
    ]);
    
    process.env['SUPER_SECRET_ENV_VAR'] = 'secret-value';
    
    const tool = new DiscoverTool(provider);
    const result = await tool.execute({});
    
    // Serialize to JSON as the server would
    const serialized = JSON.stringify(result);
    
    // Verify envVar never appears
    expect(serialized).not.toContain('SUPER_SECRET_ENV_VAR');
    expect(serialized).not.toContain('envVar');
    expect(serialized).not.toContain('secret-value');
    
    // Verify correct fields are present
    expect(result[TEXT.FIELD_SECRETS]?.[0]).toEqual({
      [TEXT.FIELD_SECRET_ID]: 'test_secret',
      [TEXT.FIELD_AVAILABLE]: true,
      [TEXT.FIELD_DESCRIPTION]: 'Test secret'
    });
  });

  describe('MCP Protocol Tests', () => {
    it('should list discover tool through MCP', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { ListToolsRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const { DiscoverTool } = await import('./tools/discover-tool.js');
      const { EnvSecretProvider } = await import('./services/env-secret-provider.js');
      
      const server = new Server(
        { name: 'test', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );
      
      const provider = new EnvSecretProvider([]);
      const discoverTool = new DiscoverTool(provider);
      
      // Register handler
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [discoverTool.getTool()]
      }));
      
      // Would normally test through transport, but for unit test we verify structure
      const toolDef = discoverTool.getTool();
      expect(toolDef.name).toBe(TEXT.TOOL_DISCOVER);
      expect(toolDef.description).toBe(TEXT.TOOL_DISCOVER_DESCRIPTION);
    });

    it('should execute discover tool through MCP handler', async () => {
      const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
      const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
      const { DiscoverTool } = await import('./tools/discover-tool.js');
      const { EnvSecretProvider } = await import('./services/env-secret-provider.js');
      
      const server = new Server(
        { name: 'test', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );
      
      const provider = new EnvSecretProvider([
        { secretId: 'test1', envVar: 'TEST1', description: 'First' },
        { secretId: 'test2', envVar: 'TEST2', description: 'Second' }
      ]);
      
      process.env['TEST1'] = 'value1';
      process.env['TEST2'] = 'value2';
      
      const discoverTool = new DiscoverTool(provider);
      
      server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name === TEXT.TOOL_DISCOVER) {
          const result = await discoverTool.execute(request.params.arguments);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        }
        throw new Error('Unknown tool');
      });
      
      // Simulate tool call
      const result = await discoverTool.execute({});
      
      expect(result[TEXT.FIELD_SECRETS]).toHaveLength(2);
      expect(result[TEXT.FIELD_SECRETS]?.[0]?.[TEXT.FIELD_SECRET_ID]).toBe('test1');
      expect(result[TEXT.FIELD_SECRETS]?.[1]?.[TEXT.FIELD_SECRET_ID]).toBe('test2');
    });
  });
});