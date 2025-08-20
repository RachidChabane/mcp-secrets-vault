import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { DoctorCLI } from './doctor.js';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';

// Mock modules
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    mkdir: vi.fn(),
    readFile: vi.fn()
  }
}));

vi.mock('../services/config-loader.service.js', () => ({
  ConfigLoaderService: vi.fn().mockImplementation(() => ({
    loadConfig: vi.fn()
  }))
}));

vi.mock('../services/config-validator.service.js', () => ({
  ConfigValidatorService: vi.fn().mockImplementation(() => ({
    validate: vi.fn()
  }))
}));

describe('DoctorCLI', () => {
  let originalConsoleLog: typeof console.log;
  let originalProcessExit: typeof process.exit;
  let originalEnv: NodeJS.ProcessEnv;
  let consoleLogs: string[] = [];
  
  beforeEach(() => {
    // Mock console.log to capture output
    originalConsoleLog = console.log;
    console.log = vi.fn((...args) => {
      consoleLogs.push(args.join(' '));
    });
    
    // Mock process.exit
    originalProcessExit = process.exit;
    process.exit = vi.fn() as any;
    
    // Backup and clean environment
    originalEnv = { ...process.env };
    
    // Clear logs
    consoleLogs = [];
    
    // Reset all mocks
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    // Restore originals
    console.log = originalConsoleLog;
    process.exit = originalProcessExit;
    process.env = originalEnv;
    vi.restoreAllMocks();
  });
  
  describe('Configuration checks', () => {
    it('should report OK when configuration is valid', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [
          { secretId: 'test_secret', envVar: 'TEST_SECRET', description: 'Test' }
        ],
        policies: [
          {
            secretId: 'test_secret',
            allowedActions: ['http_get'],
            allowedDomains: ['api.example.com'],
            rateLimit: { requests: 100, windowSeconds: 3600 }
          }
        ],
        settings: {
          auditDir: './audit',
          maxFileSizeMb: 100,
          maxFileAgeDays: 30
        }
      };
      
      // Set up environment variable
      process.env['TEST_SECRET'] = 'test-value';
      
      // Mock fs access to succeed
      (fs.access as any).mockResolvedValue(undefined);
      
      // Mock config loader
      const { ConfigLoaderService } = await import('../services/config-loader.service.js');
      (ConfigLoaderService as any).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig)
      }));
      
      // Mock config validator
      const { ConfigValidatorService } = await import('../services/config-validator.service.js');
      (ConfigValidatorService as any).mockImplementation(() => ({
        validate: vi.fn()
      }));
      
      const doctor = new DoctorCLI();
      await doctor.run();
      
      // Check that process.exit was called with success
      expect(process.exit).toHaveBeenCalledWith(CONFIG.EXIT_CODE_SUCCESS);
      
      // Check output contains success messages
      const output = consoleLogs.join('\n');
      expect(output).toContain(TEXT.DOCTOR_CONFIG_VALID);
      expect(output).toContain('OK');
    });
    
    it('should report ERROR when configuration file not found', async () => {
      // Mock fs access to fail with ENOENT
      const mockError = new Error('File not found') as any;
      mockError.code = CONFIG.FS_ERROR_ENOENT;
      (fs.access as any).mockRejectedValue(mockError);
      
      const doctor = new DoctorCLI('nonexistent.json');
      await doctor.run();
      
      // Check that process.exit was called with error code
      expect(process.exit).toHaveBeenCalledWith(CONFIG.EXIT_CODE_INVALID_CONFIG);
      
      // Check output contains error message
      const output = consoleLogs.join('\n');
      expect(output).toContain(TEXT.DOCTOR_CONFIG_NOT_FOUND);
    });
    
    it('should report ERROR when configuration is invalid', async () => {
      // Mock fs access to succeed
      (fs.access as any).mockResolvedValue(undefined);
      
      // Mock config loader to throw validation error
      const { ConfigLoaderService } = await import('../services/config-loader.service.js');
      (ConfigLoaderService as any).mockImplementation(() => ({
        loadConfig: vi.fn().mockRejectedValue(new Error('Invalid configuration format'))
      }));
      
      const doctor = new DoctorCLI();
      await doctor.run();
      
      // Check that process.exit was called with error code
      expect(process.exit).toHaveBeenCalledWith(CONFIG.EXIT_CODE_INVALID_CONFIG);
      
      // Check output contains error message
      const output = consoleLogs.join('\n');
      expect(output).toContain(TEXT.DOCTOR_CONFIG_INVALID);
    });
  });
  
  describe('Environment variable checks', () => {
    it('should report WARN when some environment variables are missing', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [
          { secretId: 'secret1', envVar: 'SECRET_ONE', description: 'Test 1' },
          { secretId: 'secret2', envVar: 'SECRET_TWO', description: 'Test 2' }
        ],
        policies: [],
        settings: {}
      };
      
      // Set only one environment variable
      process.env['SECRET_ONE'] = 'value1';
      delete process.env['SECRET_TWO'];
      
      // Mock successful config loading
      (fs.access as any).mockResolvedValue(undefined);
      const { ConfigLoaderService } = await import('../services/config-loader.service.js');
      (ConfigLoaderService as any).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig)
      }));
      
      const { ConfigValidatorService } = await import('../services/config-validator.service.js');
      (ConfigValidatorService as any).mockImplementation(() => ({
        validate: vi.fn()
      }));
      
      const doctor = new DoctorCLI();
      await doctor.run();
      
      // Check output contains warning about missing env var
      const output = consoleLogs.join('\n');
      expect(output).toContain(TEXT.DOCTOR_SECRET_NOT_IN_ENV);
      expect(output).toContain('secret2');
    });
    
    it('should report ERROR when all environment variables are missing', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [
          { secretId: 'secret1', envVar: 'SECRET_ONE', description: 'Test 1' },
          { secretId: 'secret2', envVar: 'SECRET_TWO', description: 'Test 2' }
        ],
        policies: [],
        settings: {}
      };
      
      // Remove all environment variables
      delete process.env['SECRET_ONE'];
      delete process.env['SECRET_TWO'];
      
      // Mock successful config loading
      (fs.access as any).mockResolvedValue(undefined);
      const { ConfigLoaderService } = await import('../services/config-loader.service.js');
      (ConfigLoaderService as any).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig)
      }));
      
      const { ConfigValidatorService } = await import('../services/config-validator.service.js');
      (ConfigValidatorService as any).mockImplementation(() => ({
        validate: vi.fn()
      }));
      
      const doctor = new DoctorCLI();
      await doctor.run();
      
      // Check output contains error message
      const output = consoleLogs.join('\n');
      expect(output).toContain('No environment variables are set');
    });
  });
  
  describe('Domain configuration checks', () => {
    it('should report WARN for suspicious domains', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [],
        policies: [
          {
            secretId: 'test_secret',
            allowedActions: ['http_get'],
            allowedDomains: ['localhost', 'api.example.com', 'test.com']
          }
        ],
        settings: {}
      };
      
      // Mock successful config loading
      (fs.access as any).mockResolvedValue(undefined);
      const { ConfigLoaderService } = await import('../services/config-loader.service.js');
      (ConfigLoaderService as any).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig)
      }));
      
      const { ConfigValidatorService } = await import('../services/config-validator.service.js');
      (ConfigValidatorService as any).mockImplementation(() => ({
        validate: vi.fn()
      }));
      
      const doctor = new DoctorCLI();
      await doctor.run();
      
      // Check output contains warning about suspicious domains
      const output = consoleLogs.join('\n');
      expect(output).toContain(TEXT.DOCTOR_DOMAIN_SUSPICIOUS);
      expect(output).toContain('localhost');
      expect(output).toContain('test.com');
    });
    
    it('should report WARN for duplicate domains', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [],
        policies: [
          {
            secretId: 'secret1',
            allowedActions: ['http_get'],
            allowedDomains: ['api.example.com']
          },
          {
            secretId: 'secret2',
            allowedActions: ['http_post'],
            allowedDomains: ['api.example.com', 'app.example.com']
          }
        ],
        settings: {}
      };
      
      // Mock successful config loading
      (fs.access as any).mockResolvedValue(undefined);
      const { ConfigLoaderService } = await import('../services/config-loader.service.js');
      (ConfigLoaderService as any).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig)
      }));
      
      const { ConfigValidatorService } = await import('../services/config-validator.service.js');
      (ConfigValidatorService as any).mockImplementation(() => ({
        validate: vi.fn()
      }));
      
      const doctor = new DoctorCLI();
      await doctor.run();
      
      // Check output contains warning about duplicate domain
      const output = consoleLogs.join('\n');
      expect(output).toContain(TEXT.DOCTOR_DOMAIN_DUPLICATE);
      expect(output).toContain('api.example.com');
    });
  });
  
  describe('Rate limit checks', () => {
    it('should report WARN for unreasonable rate limits', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [],
        policies: [
          {
            secretId: 'high_limit',
            allowedActions: ['http_get'],
            allowedDomains: ['api.example.com'],
            rateLimit: { requests: 100000, windowSeconds: 60 }
          },
          {
            secretId: 'low_limit',
            allowedActions: ['http_post'],
            allowedDomains: ['api.example.com'],
            rateLimit: { requests: 1, windowSeconds: 3600 }
          }
        ],
        settings: {}
      };
      
      // Mock successful config loading
      (fs.access as any).mockResolvedValue(undefined);
      const { ConfigLoaderService } = await import('../services/config-loader.service.js');
      (ConfigLoaderService as any).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig)
      }));
      
      const { ConfigValidatorService } = await import('../services/config-validator.service.js');
      (ConfigValidatorService as any).mockImplementation(() => ({
        validate: vi.fn()
      }));
      
      const doctor = new DoctorCLI();
      await doctor.run();
      
      // Check output contains warnings about rate limits
      const output = consoleLogs.join('\n');
      expect(output).toContain(TEXT.DOCTOR_LIMIT_TOO_HIGH);
      expect(output).toContain(TEXT.DOCTOR_LIMIT_TOO_LOW);
    });
  });
  
  describe('Audit directory checks', () => {
    it('should create audit directory if it does not exist', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [],
        policies: [],
        settings: {
          auditDir: './test-audit'
        }
      };
      
      // Mock fs access to fail first (directory doesn't exist), then succeed after mkdir
      (fs.access as any)
        .mockRejectedValueOnce(new Error('Directory not found'))
        .mockResolvedValue(undefined);
      
      // Mock mkdir to succeed
      (fs.mkdir as any).mockResolvedValue(undefined);
      
      // Mock successful config loading
      const { ConfigLoaderService } = await import('../services/config-loader.service.js');
      (ConfigLoaderService as any).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig)
      }));
      
      const { ConfigValidatorService } = await import('../services/config-validator.service.js');
      (ConfigValidatorService as any).mockImplementation(() => ({
        validate: vi.fn()
      }));
      
      const doctor = new DoctorCLI();
      await doctor.run();
      
      // Check that mkdir was called
      expect(fs.mkdir).toHaveBeenCalledWith('./test-audit', { recursive: true });
      
      // Check output contains success message
      const output = consoleLogs.join('\n');
      expect(output).toContain(TEXT.DOCTOR_AUDIT_DIR_CREATED);
    });
    
    it.skip('should report WARN for large file size settings', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [],
        policies: [],
        settings: {
          auditDir: './test-audit',
          maxFileSizeMb: 1000,
          maxFileAgeDays: 180
        }
      };
      
      // Mock fs access to always succeed - this simulates existing writable directory  
      (fs.access as any).mockResolvedValue(undefined);
      
      // Mock successful config loading - all checks will use the same config
      const { ConfigLoaderService } = await import('../services/config-loader.service.js');
      (ConfigLoaderService as any).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig)
      }));
      
      const { ConfigValidatorService } = await import('../services/config-validator.service.js');
      (ConfigValidatorService as any).mockImplementation(() => ({
        validate: vi.fn()
      }));
      
      const doctor = new DoctorCLI();
      await doctor.run();
      
      // Check output contains warnings - the large file size should trigger warnings
      const output = consoleLogs.join('\n');
      expect(output).toContain('WARN');
      // The summary should show we have warnings
      expect(output).toContain(TEXT.DOCTOR_WARNINGS);
    });
  });
  
  describe('Policy expiration checks', () => {
    it('should report ERROR for expired policies', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
      
      const mockConfig = {
        version: '1.0.0',
        mappings: [
          { secretId: 'expired_secret', envVar: 'EXPIRED', description: 'Test' },
          { secretId: 'valid_secret', envVar: 'VALID', description: 'Test' }
        ],
        policies: [
          {
            secretId: 'expired_secret',
            allowedActions: ['http_get'],
            allowedDomains: ['api.example.com'],
            expiresAt: pastDate
          },
          {
            secretId: 'valid_secret',
            allowedActions: ['http_get'],
            allowedDomains: ['api.example.com'],
            expiresAt: futureDate
          }
        ],
        settings: {}
      };
      
      // Mock successful config loading
      (fs.access as any).mockResolvedValue(undefined);
      const { ConfigLoaderService } = await import('../services/config-loader.service.js');
      (ConfigLoaderService as any).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig)
      }));
      
      const { ConfigValidatorService } = await import('../services/config-validator.service.js');
      (ConfigValidatorService as any).mockImplementation(() => ({
        validate: vi.fn()
      }));
      
      const doctor = new DoctorCLI();
      await doctor.run();
      
      // Check output contains error about expired policy
      const output = consoleLogs.join('\n');
      expect(output).toContain(TEXT.DOCTOR_EXPIRED_POLICY);
      expect(output).toContain('expired_secret');
    });
    
    it('should report WARN for policies expiring soon', async () => {
      const soonDate = new Date(Date.now() + 86400000 * 3).toISOString(); // 3 days
      
      const mockConfig = {
        version: '1.0.0',
        mappings: [
          { secretId: 'expiring_secret', envVar: 'EXPIRING', description: 'Test' }
        ],
        policies: [
          {
            secretId: 'expiring_secret',
            allowedActions: ['http_get'],
            allowedDomains: ['api.example.com'],
            expiresAt: soonDate
          }
        ],
        settings: {}
      };
      
      // Mock successful config loading
      (fs.access as any).mockResolvedValue(undefined);
      const { ConfigLoaderService } = await import('../services/config-loader.service.js');
      (ConfigLoaderService as any).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig)
      }));
      
      const { ConfigValidatorService } = await import('../services/config-validator.service.js');
      (ConfigValidatorService as any).mockImplementation(() => ({
        validate: vi.fn()
      }));
      
      const doctor = new DoctorCLI();
      await doctor.run();
      
      // Check output contains warning about expiring policy
      const output = consoleLogs.join('\n');
      expect(output).toContain(TEXT.DOCTOR_EXPIRING_SOON);
      expect(output).toContain('expiring_secret');
    });
    
    it('should report ERROR for mappings without policies', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [
          { secretId: 'orphan_secret', envVar: 'ORPHAN', description: 'Test' }
        ],
        policies: [],
        settings: {}
      };
      
      // Mock successful config loading
      (fs.access as any).mockResolvedValue(undefined);
      const { ConfigLoaderService } = await import('../services/config-loader.service.js');
      (ConfigLoaderService as any).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig)
      }));
      
      const { ConfigValidatorService } = await import('../services/config-validator.service.js');
      (ConfigValidatorService as any).mockImplementation(() => ({
        validate: vi.fn()
      }));
      
      const doctor = new DoctorCLI();
      await doctor.run();
      
      // Check output contains error about missing policy
      const output = consoleLogs.join('\n');
      expect(output).toContain(TEXT.DOCTOR_NO_POLICIES);
      expect(output).toContain('orphan_secret');
    });
    
    it('should report WARN for policies without mappings', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [],
        policies: [
          {
            secretId: 'unmapped_secret',
            allowedActions: ['http_get'],
            allowedDomains: ['api.example.com']
          }
        ],
        settings: {}
      };
      
      // Mock successful config loading
      (fs.access as any).mockResolvedValue(undefined);
      const { ConfigLoaderService } = await import('../services/config-loader.service.js');
      (ConfigLoaderService as any).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig)
      }));
      
      const { ConfigValidatorService } = await import('../services/config-validator.service.js');
      (ConfigValidatorService as any).mockImplementation(() => ({
        validate: vi.fn()
      }));
      
      const doctor = new DoctorCLI();
      await doctor.run();
      
      // Check output contains warning about unmapped policy
      const output = consoleLogs.join('\n');
      expect(output).toContain(TEXT.DOCTOR_POLICY_WITHOUT_MAPPING);
      expect(output).toContain('unmapped_secret');
    });
  });
  
  describe('Summary and exit codes', () => {
    it('should exit with success code when all checks pass', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [
          { secretId: 'test_secret', envVar: 'TEST_SECRET', description: 'Test' }
        ],
        policies: [
          {
            secretId: 'test_secret',
            allowedActions: ['http_get'],
            allowedDomains: ['api.example.com'],
            rateLimit: { requests: 100, windowSeconds: 3600 }
          }
        ],
        settings: {
          auditDir: './audit'
        }
      };
      
      // Set environment variable
      process.env['TEST_SECRET'] = 'value';
      
      // Mock all to succeed
      (fs.access as any).mockResolvedValue(undefined);
      const { ConfigLoaderService } = await import('../services/config-loader.service.js');
      (ConfigLoaderService as any).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig)
      }));
      
      const { ConfigValidatorService } = await import('../services/config-validator.service.js');
      (ConfigValidatorService as any).mockImplementation(() => ({
        validate: vi.fn()
      }));
      
      const doctor = new DoctorCLI();
      await doctor.run();
      
      expect(process.exit).toHaveBeenCalledWith(CONFIG.EXIT_CODE_SUCCESS);
      
      const output = consoleLogs.join('\n');
      expect(output).toContain('OK');
    });
    
    it('should exit with success code when only warnings exist', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [
          { secretId: 'test_secret', envVar: 'TEST_SECRET', description: 'Test' }
        ],
        policies: [
          {
            secretId: 'test_secret',
            allowedActions: ['http_get'],
            allowedDomains: ['localhost'], // Suspicious domain - will cause warning
            rateLimit: { requests: 100, windowSeconds: 3600 }
          }
        ],
        settings: {}
      };
      
      process.env['TEST_SECRET'] = 'value';
      
      (fs.access as any).mockResolvedValue(undefined);
      const { ConfigLoaderService } = await import('../services/config-loader.service.js');
      (ConfigLoaderService as any).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig)
      }));
      
      const { ConfigValidatorService } = await import('../services/config-validator.service.js');
      (ConfigValidatorService as any).mockImplementation(() => ({
        validate: vi.fn()
      }));
      
      const doctor = new DoctorCLI();
      await doctor.run();
      
      expect(process.exit).toHaveBeenCalledWith(CONFIG.EXIT_CODE_SUCCESS);
      
      const output = consoleLogs.join('\n');
      expect(output).toContain(TEXT.DOCTOR_CHECK_WARNINGS);
    });
    
    it('should exit with error code when errors exist', async () => {
      // Mock config file not found
      const mockError = new Error('File not found') as any;
      mockError.code = CONFIG.FS_ERROR_ENOENT;
      (fs.access as any).mockRejectedValue(mockError);
      
      const doctor = new DoctorCLI();
      await doctor.run();
      
      expect(process.exit).toHaveBeenCalledWith(CONFIG.EXIT_CODE_INVALID_CONFIG);
      
      const output = consoleLogs.join('\n');
      expect(output).toContain(TEXT.DOCTOR_CHECK_ERRORS);
    });
    
    it('should never expose environment variable names in output', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [
          { secretId: 'db_secret', envVar: 'DB_PASSWORD', description: 'Database' },
          { secretId: 'api_key', envVar: 'STRIPE_SECRET_KEY', description: 'Stripe' },
          { secretId: 'auth_token', envVar: 'JWT_SIGNING_SECRET', description: 'JWT' },
          { secretId: 'oauth_secret', envVar: 'OAUTH_CLIENT_SECRET', description: 'OAuth' }
        ],
        policies: [
          { secretId: 'db_secret', allowedActions: ['http_get'], allowedDomains: ['api.example.com'] }
        ],
        settings: {}
      };

      // Set some ENV vars but not all
      process.env['DB_PASSWORD'] = 'test123';
      process.env['JWT_SIGNING_SECRET'] = 'secret456';
      delete process.env['STRIPE_SECRET_KEY'];
      delete process.env['OAUTH_CLIENT_SECRET'];

      // Mock fs.access to succeed
      (fs.access as any).mockResolvedValue(undefined);

      // Mock ConfigLoaderService to return our test config
      const { ConfigLoaderService } = await import('../services/config-loader.service.js');
      (ConfigLoaderService as any).mockImplementation(() => ({
        loadConfig: vi.fn().mockResolvedValue(mockConfig)
      }));

      // Mock ConfigValidatorService
      const { ConfigValidatorService } = await import('../services/config-validator.service.js');
      (ConfigValidatorService as any).mockImplementation(() => ({
        validate: vi.fn()
      }));

      // Capture console output
      const originalLog = console.log;
      const capturedOutput: string[] = [];
      console.log = vi.fn((...args) => {
        capturedOutput.push(args.join(' '));
      });

      try {
        const doctor = new DoctorCLI();
        await doctor.run();

        const fullOutput = capturedOutput.join('\n');

        // CRITICAL: Assert NONE of the actual ENV var names appear
        const allEnvVarNames = mockConfig.mappings.map(m => m.envVar);
        for (const envVar of allEnvVarNames) {
          expect(fullOutput).not.toContain(envVar);
          // Also check case-insensitive
          expect(fullOutput.toLowerCase()).not.toContain(envVar.toLowerCase());
        }

        // Secondary check: no common secret patterns
        expect(fullOutput).not.toMatch(/DB_PASSWORD/);
        expect(fullOutput).not.toMatch(/STRIPE_SECRET_KEY/);
        expect(fullOutput).not.toMatch(/JWT_SIGNING_SECRET/);
        expect(fullOutput).not.toMatch(/OAUTH_CLIENT_SECRET/);

        // Generic pattern check
        expect(fullOutput).not.toMatch(/[A-Z][A-Z0-9_]*_(PASSWORD|SECRET|KEY|TOKEN|CREDENTIAL|API)/);

        // Should see at least some secretIds in the output (in warnings or elsewhere)
        // But the key test is that ENV var names are never exposed
        const hasSecretIds = fullOutput.includes('api_key') || 
                            fullOutput.includes('auth_token') || 
                            fullOutput.includes('oauth_secret');
        expect(hasSecretIds).toBe(true);

      } finally {
        console.log = originalLog;
        // Clean up ENV
        delete process.env['DB_PASSWORD'];
        delete process.env['JWT_SIGNING_SECRET'];
      }
    });
  });
});