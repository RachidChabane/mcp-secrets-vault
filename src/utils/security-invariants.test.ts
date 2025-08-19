import { describe, it, expect } from 'vitest';
import {
  redactSensitiveValue,
  sanitizeUrl,
  deepSanitizeObject,
  deepFreeze,
  sanitizeError,
  createSanitizedImmutableCopy,
  sanitizeResponse,
  containsSensitiveData
} from './security.js';
import { CONFIG } from '../constants/config-constants.js';

describe('Security Invariants', () => {
  describe('Never expose envVar', () => {
    it('should redact envVar field names', () => {
      const input = { envVar: 'SECRET_KEY', data: 'test' };
      const result = deepSanitizeObject(input);
      expect(result.envVar).toBe(CONFIG.SANITIZE_REPLACEMENT);
      expect(JSON.stringify(result)).not.toContain('SECRET_KEY');
    });
    
    it('should redact env field names', () => {
      const input = { env: 'API_SECRET', other: 'data' };
      const result = deepSanitizeObject(input);
      expect(result.env).toBe(CONFIG.SANITIZE_REPLACEMENT);
      expect(JSON.stringify(result)).not.toContain('API_SECRET');
    });
    
    it('should redact nested envVar fields', () => {
      const input = {
        config: {
          settings: {
            envVar: 'DATABASE_PASSWORD',
            env: 'REDIS_KEY'
          }
        }
      };
      const result = deepSanitizeObject(input);
      expect(result.config.settings.envVar).toBe(CONFIG.SANITIZE_REPLACEMENT);
      expect(result.config.settings.env).toBe(CONFIG.SANITIZE_REPLACEMENT);
      expect(JSON.stringify(result)).not.toContain('DATABASE_PASSWORD');
      expect(JSON.stringify(result)).not.toContain('REDIS_KEY');
    });
  });
  
  describe('Never expose secret values', () => {
    it('should redact JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = redactSensitiveValue(jwt);
      expect(result).toBe(CONFIG.SANITIZE_REPLACEMENT);
    });
    
    it('should redact Bearer tokens', () => {
      const input = 'Authorization: Bearer sk_test_1234567890abcdef';
      const result = redactSensitiveValue(input);
      expect(result).not.toContain('sk_test_1234567890abcdef');
      expect(result).toContain(CONFIG.SANITIZE_REPLACEMENT);
    });
    
    it('should redact API keys in various formats', () => {
      const keys = [
        'sk_live_1234567890abcdef1234567890abcdef',
        'ghp_1234567890abcdef1234567890abcdef1234',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      ];
      
      for (const key of keys) {
        const result = redactSensitiveValue(key);
        expect(result).toBe(CONFIG.SANITIZE_REPLACEMENT);
      }
    });
    
    it('should redact environment variable patterns', () => {
      const input = 'Using API_KEY and DATABASE_SECRET for auth';
      const result = redactSensitiveValue(input);
      expect(result).toContain(CONFIG.SANITIZE_REPLACEMENT);
      expect(result).not.toContain('API_KEY');
      expect(result).not.toContain('DATABASE_SECRET');
    });
    
    it('should redact key=value patterns', () => {
      const input = 'api_key=secret123 token=abc456 password=xyz789';
      const result = redactSensitiveValue(input);
      expect(result).toContain(`api_key=${CONFIG.SANITIZE_REPLACEMENT}`);
      expect(result).toContain(`token=${CONFIG.SANITIZE_REPLACEMENT}`);
      expect(result).toContain(`password=${CONFIG.SANITIZE_REPLACEMENT}`);
    });
  });
  
  describe('URL sanitization', () => {
    it('should strip authentication from URLs', () => {
      const url = 'https://user:password@example.com/path';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/path');
      expect(result).not.toContain('user');
      expect(result).not.toContain('password');
    });
    
    it('should redact auth query parameters', () => {
      const url = 'https://api.example.com/endpoint?api_key=secret&user=john';
      const result = sanitizeUrl(url);
      // URL sanitization may encode the replacement, check both possibilities
      expect(result.includes(`api_key=${CONFIG.SANITIZE_REPLACEMENT}`) || 
             result.includes(`api_key=${encodeURIComponent(CONFIG.SANITIZE_REPLACEMENT)}`)).toBe(true);
      expect(result).toContain('user=john');
    });
    
    it('should handle invalid URLs safely', () => {
      const invalidUrl = 'not-a-valid-url-with-secret-12345';
      const result = sanitizeUrl(invalidUrl);
      expect(result).not.toContain('secret-12345');
    });
  });
  
  describe('Deep object immutability', () => {
    it('should make objects deeply immutable', () => {
      const obj = {
        level1: {
          level2: {
            value: 'test'
          }
        }
      };
      
      const frozen = deepFreeze(obj);
      
      expect(() => {
        (frozen as any).level1 = 'new';
      }).toThrow();
      
      expect(() => {
        (frozen as any).level1.level2 = 'new';
      }).toThrow();
      
      expect(() => {
        (frozen as any).level1.level2.value = 'new';
      }).toThrow();
    });
    
    it('should handle arrays in deep freeze', () => {
      const arr = [{ a: 1 }, { b: 2 }];
      const frozen = deepFreeze(arr);
      
      expect(() => {
        (frozen as any).push({ c: 3 });
      }).toThrow();
      
      expect(() => {
        (frozen as any)[0].a = 2;
      }).toThrow();
    });
  });
  
  describe('Error sanitization', () => {
    it('should never expose stack traces', () => {
      const error = new Error('Connection failed with api_key=secret123');
      (error as any).stack = 'Error: Connection failed with api_key=secret123\n    at function1\n    at function2';
      
      const result = sanitizeError(error);
      expect(result).not.toContain('function1');
      expect(result).not.toContain('function2');
      expect(result).toContain(CONFIG.SANITIZE_REPLACEMENT);
    });
    
    it('should sanitize error messages', () => {
      const error = new Error('Failed to connect with token=1234567890abcdef1234567890abcdef');
      const result = sanitizeError(error);
      expect(result).toContain(`token=${CONFIG.SANITIZE_REPLACEMENT}`);
    });
  });
  
  describe('Sensitive data detection', () => {
    it('should detect JWT tokens in objects', () => {
      const obj = {
        auth: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature'
      };
      
      const violations = containsSensitiveData(obj);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some(v => v.includes('JWT token'))).toBe(true);
    });
    
    it('should detect unredacted sensitive fields', () => {
      const obj = {
        password: 'actualPassword',
        apiKey: 'actualKey',
        normal: 'data'
      };
      
      const violations = containsSensitiveData(obj);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some(v => v.includes('password'))).toBe(true);
      expect(violations.some(v => v.includes('apiKey'))).toBe(true);
    });
    
    it('should not flag properly redacted fields', () => {
      const obj = {
        password: CONFIG.SANITIZE_REPLACEMENT,
        apiKey: CONFIG.SANITIZE_REPLACEMENT,
        normal: 'data'
      };
      
      const violations = containsSensitiveData(obj);
      expect(violations.length).toBe(0);
    });
  });
  
  describe('Response sanitization', () => {
    it('should sanitize and freeze responses', () => {
      const response = {
        data: 'result',
        secret: 'api_key=12345',
        envVar: 'SECRET_VALUE'
      };
      
      const sanitized = sanitizeResponse(response);
      
      expect(sanitized.envVar).toBe(CONFIG.SANITIZE_REPLACEMENT);
      expect(JSON.stringify(sanitized)).not.toContain('12345');
      expect(JSON.stringify(sanitized)).not.toContain('SECRET_VALUE');
      
      expect(() => {
        (sanitized as any).data = 'modified';
      }).toThrow();
    });
  });
  
  describe('Fuzz testing', () => {
    it('should handle various malicious inputs safely', () => {
      const maliciousInputs = [
        { envVar: 'DROP TABLE users;--' },
        { env: '<script>alert("xss")</script>' },
        { password: '../../../etc/passwd' },
        { token: 'Bearer ${process.env.SECRET}' },
        { apikey: '"; exec("rm -rf /"); //' },
        null,
        undefined,
        [],
        () => {},
        Symbol('test')
      ];
      
      for (const input of maliciousInputs) {
        const result = deepSanitizeObject(input);
        
        // Should not throw
        expect(() => JSON.stringify(result)).not.toThrow();
        
        // Should not contain any of the malicious content
        if (result !== null && result !== undefined) {
          const serialized = JSON.stringify(result);
          expect(serialized).not.toContain('DROP TABLE');
          expect(serialized).not.toContain('<script>');
          expect(serialized).not.toContain('../../../');
          expect(serialized).not.toContain('process.env');
          expect(serialized).not.toContain('exec(');
        }
      }
    });
    
    it('should handle deeply nested objects without stack overflow', () => {
      let nested: any = { value: 'test' };
      for (let i = 0; i < 100; i++) {
        nested = { child: nested };
      }
      
      expect(() => deepSanitizeObject(nested, 10)).not.toThrow();
    });
  });
  
  describe('Security invariant: No sensitive data in any output', () => {
    it('should ensure complete sanitization pipeline', () => {
      const complexObject = {
        user: {
          name: 'John',
          envVar: 'DATABASE_URL',
          credentials: {
            apiKey: 'sk_live_1234567890',
            token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
            password: 'secret123'
          }
        },
        config: {
          url: 'https://user:pass@api.example.com/endpoint?api_key=secret',
          headers: {
            Authorization: 'Bearer token123',
            'X-API-Key': 'key456'
          }
        },
        errors: [
          new Error('Failed with api_key=789'),
          'Connection error: token=abc'
        ]
      };
      
      const sanitized = createSanitizedImmutableCopy(complexObject);
      const serialized = JSON.stringify(sanitized);
      
      // Verify no sensitive data appears
      expect(serialized).not.toContain('DATABASE_URL');
      expect(serialized).not.toContain('sk_live_1234567890');
      expect(serialized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(serialized).not.toContain('secret123');
      expect(serialized).not.toContain('user:pass');
      expect(serialized).not.toContain('token123');
      expect(serialized).not.toContain('key456');
      expect(serialized).not.toContain('789');
      expect(serialized).not.toContain('abc');
      
      // Verify structure is preserved
      expect(sanitized.user).toBeDefined();
      expect(sanitized.user.name).toBe('John');
      expect(sanitized.user.envVar).toBe(CONFIG.SANITIZE_REPLACEMENT);
      
      // Verify immutability
      expect(() => {
        (sanitized as any).user.name = 'Jane';
      }).toThrow();
    });
  });
});