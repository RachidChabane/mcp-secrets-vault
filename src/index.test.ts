import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
    
    expect(result).toHaveProperty('secrets');
    expect(Array.isArray(result.secrets)).toBe(true);
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
    expect(result.secrets[0]).toEqual({
      secretId: 'test_secret',
      available: true,
      description: 'Test secret'
    });
  });
});