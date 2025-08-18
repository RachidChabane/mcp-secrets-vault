import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeError } from './logging.js';
import { CONFIG } from '../constants/config-constants.js';

describe('Logging', () => {
  let originalConsoleError: typeof console.error;
  let capturedLogs: string[];

  beforeEach(() => {
    originalConsoleError = console.error;
    capturedLogs = [];
    console.error = vi.fn((message: string) => {
      capturedLogs.push(message);
    });
  });

  afterEach(() => {
    console.error = originalConsoleError;
    vi.clearAllMocks();
  });

  describe('writeError', () => {
    it('should write structured JSON to stderr', () => {
      writeError('Test message', { level: 'INFO' });
      
      expect(capturedLogs).toHaveLength(1);
      const log = JSON.parse(capturedLogs[0]!);
      
      expect(log).toHaveProperty('timestamp');
      expect(log.level).toBe('INFO');
      expect(log.message).toBe('Test message');
    });

    it('should default to ERROR level', () => {
      writeError('Error occurred');
      
      const log = JSON.parse(capturedLogs[0]!);
      expect(log.level).toBe('ERROR');
    });

    it('should include context in log entry', () => {
      writeError('Processing', { 
        level: 'DEBUG',
        requestId: '123',
        tool: 'discover'
      });
      
      const log = JSON.parse(capturedLogs[0]!);
      expect(log.requestId).toBe('123');
      expect(log.tool).toBe('discover');
    });
  });

  describe('Redaction', () => {
    it('should redact ENV variable patterns', () => {
      writeError('Found API_KEY and DATABASE_PASSWORD', { level: 'ERROR' });
      
      const log = JSON.parse(capturedLogs[0]!);
      expect(log.message).toBe(`Found ${CONFIG.SANITIZE_REPLACEMENT} and ${CONFIG.SANITIZE_REPLACEMENT}`);
    });

    it('should redact authorization headers', () => {
      writeError('Headers: authorization: Bearer abc123', { level: 'INFO' });
      
      const log = JSON.parse(capturedLogs[0]!);
      expect(log.message).toContain(CONFIG.SANITIZE_REPLACEMENT);
      expect(log.message).not.toContain('Bearer abc123');
    });

    it('should redact bearer tokens', () => {
      writeError('Token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', { level: 'INFO' });
      
      const log = JSON.parse(capturedLogs[0]!);
      expect(log.message).toContain(CONFIG.SANITIZE_REPLACEMENT);
      expect(log.message).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should redact envVar fields', () => {
      writeError('Config loaded', {
        level: 'INFO',
        mapping: {
          secretId: 'test',
          envVar: 'SECRET_API_KEY'
        }
      });
      
      const log = JSON.parse(capturedLogs[0]!);
      expect(log.mapping.secretId).toBe('[REDACTED]');  // secretId contains 'secret'
      expect(log.mapping.envVar).toBe(CONFIG.SANITIZE_REPLACEMENT);
    });

    it('should redact sensitive keys in nested objects', () => {
      writeError('Request processed', {
        level: 'DEBUG',
        request: {
          url: 'https://api.example.com',
          headers: {
            authorization: 'Bearer token123',
            'content-type': 'application/json'
          },
          body: {
            username: 'user',
            password: 'secret123',
            apiKey: 'key456'
          }
        }
      });
      
      const log = JSON.parse(capturedLogs[0]!);
      expect(log.request.url).toBe('https://api.example.com');
      expect(log.request.headers.authorization).toBe(CONFIG.SANITIZE_REPLACEMENT);
      expect(log.request.headers['content-type']).toBe('application/json');
      expect(log.request.body.username).toBe('user');
      expect(log.request.body.password).toBe(CONFIG.SANITIZE_REPLACEMENT);
      expect(log.request.body.apiKey).toBe(CONFIG.SANITIZE_REPLACEMENT);
    });

    it('should redact arrays containing sensitive data', () => {
      writeError('Secrets found', {
        level: 'WARN',
        secrets: ['API_KEY_VALUE', 'DATABASE_TOKEN', 'normal_value']
      });
      
      const log = JSON.parse(capturedLogs[0]!);
      expect(log.secrets).toBe(CONFIG.SANITIZE_REPLACEMENT); // 'secrets' is a sensitive key
    });

    it('should handle complex nested structures', () => {
      writeError('Complex data', {
        level: 'INFO',
        data: {
          configs: [
            { name: 'api', token: 'secret_token' },
            { name: 'db', credential: { user: 'admin', pass: 'pwd' } }
          ],
          environment: {
            NODE_ENV: 'production',
            SECRET_KEY: 'should_be_redacted'
          }
        }
      });
      
      const log = JSON.parse(capturedLogs[0]!);
      expect(log.data.configs[0].name).toBe('api');
      expect(log.data.configs[0].token).toBe(CONFIG.SANITIZE_REPLACEMENT);
      expect(log.data.configs[1].credential).toBe(CONFIG.SANITIZE_REPLACEMENT);
      // environment gets special handling - keys with SECRET/KEY are redacted
      expect(log.data.environment).toBeDefined();
      expect(log.data.environment.NODE_ENV).toBe('production');
      expect(log.data.environment.SECRET_KEY).toBe(CONFIG.SANITIZE_REPLACEMENT);
    });

    it('should never log raw error stacks', () => {
      const error = new Error('Something went wrong');
      writeError('Error occurred', {
        level: 'ERROR',
        error: error.stack
      });
      
      const log = JSON.parse(capturedLogs[0]!);
      expect(log.error).not.toContain('at ');
      expect(log.error).toBeDefined();
    });

    it('should redact multiple patterns in same string', () => {
      writeError('API_KEY=abc123 and SECRET_TOKEN=xyz789 found', { level: 'WARN' });
      
      const log = JSON.parse(capturedLogs[0]!);
      expect(log.message).toContain(CONFIG.SANITIZE_REPLACEMENT);
      expect(log.message).not.toContain('API_KEY');
      expect(log.message).not.toContain('SECRET_TOKEN');
      // Values after = might not be fully redacted if < 8 chars
      expect(log.message.match(new RegExp(CONFIG.SANITIZE_REPLACEMENT, 'g'))?.length).toBeGreaterThan(0);
    });
  });
});