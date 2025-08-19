import { describe, it, expect } from 'vitest';
import {
  validateDomain,
  validateUrl,
  validateAction,
  validateHeaderName,
  validateHeaderValue,
  validateAndSanitizeInput
} from './validation.js';
import { CONFIG } from '../constants/config-constants.js';
import { ValidationError } from './errors.js';

describe('Enhanced Validation', () => {
  describe('validateDomain', () => {
    it('should accept valid domains', () => {
      const validDomains = [
        'example.com',
        'api.example.com',
        'sub.domain.example.co.uk',
        'example-with-dash.com',
        'UPPERCASE.COM'
      ];
      
      for (const domain of validDomains) {
        const result = validateDomain(domain);
        expect(result).toBe(domain.trim().toLowerCase());
      }
    });
    
    it('should reject invalid domains', () => {
      const invalidDomains = [
        'a.b',  // Too short
        'example',  // No TLD
        'example.',  // Trailing dot
        '.example.com',  // Leading dot
        'example-.com',  // Dash at end of label
        '-example.com',  // Dash at start of label
        'exam ple.com',  // Space
        'example.com/path',  // Path included
        'https://example.com',  // Protocol included
        'a'.repeat(254) + '.com'  // Too long
      ];
      
      for (const domain of invalidDomains) {
        expect(() => validateDomain(domain)).toThrow(ValidationError);
      }
    });
    
    it('should trim and lowercase domains', () => {
      expect(validateDomain('  EXAMPLE.COM  ')).toBe('example.com');
      expect(validateDomain('\tAPI.Example.Com\n')).toBe('api.example.com');
    });
  });
  
  describe('validateUrl', () => {
    it('should accept valid URLs', () => {
      const validUrls = [
        'https://example.com',
        'https://api.example.com/path',
        'https://example.com:8080/path?query=value',
        'https://example.com/path#fragment'
      ];
      
      for (const url of validUrls) {
        const result = validateUrl(url);
        expect(result).toMatch(/^https?:\/\//);
      }
    });
    
    it('should reject invalid URLs', () => {
      const invalidUrls = [
        'not-a-url',
        'ftp://example.com',  // Wrong protocol
        'javascript:alert(1)',  // XSS attempt
        'file:///etc/passwd',  // File protocol
        '../relative/path',  // Relative path
        'https://'.repeat(300) + 'example.com'  // Too long
      ];
      
      for (const url of invalidUrls) {
        expect(() => validateUrl(url)).toThrow(ValidationError);
      }
    });
    
    it('should reject URLs with authentication', () => {
      const url = 'https://user:password@example.com/path';
      expect(() => validateUrl(url)).toThrow(ValidationError);
    });
    
    it('should enforce HTTPS when required', () => {
      // Assuming DEFAULT_REQUIRE_HTTPS is true
      if (CONFIG.DEFAULT_REQUIRE_HTTPS) {
        expect(() => validateUrl('http://example.com')).toThrow(ValidationError);
      }
    });
  });
  
  describe('validateAction', () => {
    it('should accept valid actions', () => {
      const validActions = CONFIG.SUPPORTED_ACTIONS;
      
      for (const action of validActions) {
        const result = validateAction(action);
        expect(result).toBe(action.toLowerCase());
      }
    });
    
    it('should reject invalid actions', () => {
      const invalidActions = [
        'DELETE',  // Not supported
        'http-get',  // Wrong format (hyphen instead of underscore)
        'get',  // Not in supported list
        'a'.repeat(51),  // Too long
        'http get',  // Space
        '../../etc/passwd'  // Path traversal
      ];
      
      for (const action of invalidActions) {
        expect(() => validateAction(action), `Action "${action}" should throw`).toThrow(ValidationError);
      }
    });
    
    it('should trim and lowercase actions', () => {
      expect(validateAction('  HTTP_GET  ')).toBe('http_get');
      expect(validateAction('\tHTTP_POST\n')).toBe('http_post');
    });
  });
  
  describe('validateHeaderName', () => {
    it('should accept valid header names', () => {
      const validHeaders = [
        'Content-Type',
        'X-Custom-Header',
        'Authorization',
        'X_Underscore_Header',
        'Header123'
      ];
      
      for (const header of validHeaders) {
        const result = validateHeaderName(header);
        expect(result).toBe(header.trim());
      }
    });
    
    it('should reject invalid header names', () => {
      const invalidHeaders = [
        '',  // Empty
        '   ',  // Whitespace only
        'Header Name',  // Space
        'Header:Name',  // Colon
        'Header;Name',  // Semicolon
        'Header,Name',  // Comma
        'Header\nName',  // Newline
        'a'.repeat(101)  // Too long
      ];
      
      for (const header of invalidHeaders) {
        expect(() => validateHeaderName(header)).toThrow(ValidationError);
      }
    });
  });
  
  describe('validateHeaderValue', () => {
    it('should accept valid header values', () => {
      const validValues = [
        'application/json',
        'Bearer token123',
        'value with spaces',
        '123456',
        'text/html; charset=utf-8'
      ];
      
      for (const value of validValues) {
        const result = validateHeaderValue(value);
        expect(result).toBeTruthy();
      }
    });
    
    it('should reject too long header values', () => {
      const longValue = 'a'.repeat(CONFIG.MAX_HEADER_VALUE_LENGTH + 1);
      expect(() => validateHeaderValue(longValue)).toThrow(ValidationError);
    });
    
    it('should remove control characters', () => {
      const valueWithControl = 'test\x00value\x1Fwith\x7Fcontrol';
      const result = validateHeaderValue(valueWithControl);
      expect(result).toBe('testvaluewithcontrol');
    });
  });
  
  describe('validateAndSanitizeInput', () => {
    it('should validate non-empty strings', () => {
      const result = validateAndSanitizeInput('  test  ', 'fieldName');
      expect(result).toBe('test');
    });
    
    it('should reject non-string values', () => {
      const invalidInputs = [null, undefined, 123, {}, [], false, ''];
      
      for (const input of invalidInputs) {
        expect(() => validateAndSanitizeInput(input, 'fieldName')).toThrow(ValidationError);
      }
    });
    
    it('should use custom validator when provided', () => {
      const customValidator = (val: string) => val.toUpperCase();
      const result = validateAndSanitizeInput('test', 'fieldName', customValidator);
      expect(result).toBe('TEST');
    });
    
    it('should include field name in error', () => {
      try {
        validateAndSanitizeInput('', 'myField');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).context?.['field']).toBe('myField');
      }
    });
  });
  
  describe('Input injection prevention', () => {
    it('should prevent SQL injection attempts', () => {
      const sqlInjections = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'--",
        "1 UNION SELECT * FROM users"
      ];
      
      for (const injection of sqlInjections) {
        // These should either be rejected or sanitized
        try {
          const result = validateDomain(injection);
          // If it doesn't throw, it should be sanitized
          expect(result).not.toContain('DROP');
          expect(result).not.toContain('UNION');
          expect(result).not.toContain('--');
        } catch (error) {
          // Expected for invalid format
          expect(error).toBeInstanceOf(ValidationError);
        }
      }
    });
    
    it('should prevent XSS attempts', () => {
      const xssAttempts = [
        '<script>alert("xss")</script>',
        'javascript:alert(1)',
        'onerror=alert(1)',
        '<img src=x onerror=alert(1)>'
      ];
      
      for (const xss of xssAttempts) {
        try {
          const result = validateUrl(xss);
          // If it doesn't throw, it should be sanitized
          expect(result).not.toContain('<script>');
          expect(result).not.toContain('javascript:');
          expect(result).not.toContain('onerror');
        } catch (error) {
          // Expected for invalid format
          expect(error).toBeInstanceOf(ValidationError);
        }
      }
    });
    
    it('should prevent path traversal attempts', () => {
      const pathTraversals = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'example.com/../../../',
        'file:///etc/passwd'
      ];
      
      for (const traversal of pathTraversals) {
        expect(() => validateUrl(traversal)).toThrow(ValidationError);
      }
    });
  });
});