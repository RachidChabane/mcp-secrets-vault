import { describe, it, expect } from 'vitest';
import {
  truncateText,
  redactSensitiveValue,
  sanitizeForOutput,
  sanitizeError,
  sanitizeHeaders,
  isEmptyOrWhitespace
} from './security.js';
import { CONFIG } from '../constants/config-constants.js';

describe('Security Utilities', () => {
  describe('truncateText', () => {
    it('should not truncate text shorter than max length', () => {
      const text = 'short text';
      expect(truncateText(text, 100)).toBe(text);
    });
    
    it('should truncate text longer than max length', () => {
      const text = 'a'.repeat(150);
      const result = truncateText(text, 100);
      expect(result).toHaveLength(100 + CONFIG.RESPONSE_TRUNCATION_MESSAGE.length);
      expect(result).toContain(CONFIG.RESPONSE_TRUNCATION_MESSAGE);
    });
  });
  
  describe('redactSensitiveValue', () => {
    it('should redact URLs with authentication', () => {
      const input = 'URL: https://user:password@example.com/path';
      const result = redactSensitiveValue(input);
      expect(result).toBe(`URL: ${CONFIG.SANITIZE_REPLACEMENT}`);
    });
    
    it('should redact key=value patterns with sensitive keys', () => {
      const input = 'api_key=secret123 token=abc456';
      const result = redactSensitiveValue(input);
      expect(result).toBe(`api_key=${CONFIG.SANITIZE_REPLACEMENT} token=${CONFIG.SANITIZE_REPLACEMENT}`);
    });
    
    it('should redact long alphanumeric tokens', () => {
      const token = 'sk_1234567890abcdef1234567890abcdef';
      const result = redactSensitiveValue(token);
      expect(result).toBe(CONFIG.SANITIZE_REPLACEMENT);
    });
    
    it('should not redact regular words', () => {
      const text = 'This is a normal sentence with regular words';
      const result = redactSensitiveValue(text);
      expect(result).toBe(text);
    });
  });
  
  describe('sanitizeForOutput', () => {
    it('should truncate and redact text', () => {
      const text = 'api_key=secret123 ' + 'x'.repeat(CONFIG.RESPONSE_MAX_BODY_LENGTH);
      const result = sanitizeForOutput(text);
      expect(result).toContain(`api_key=${CONFIG.SANITIZE_REPLACEMENT}`);
      expect(result).toContain(CONFIG.RESPONSE_TRUNCATION_MESSAGE);
    });
    
    it('should use custom max length', () => {
      const text = 'test'.repeat(50);
      const result = sanitizeForOutput(text, 10);
      expect(result).toHaveLength(10 + CONFIG.RESPONSE_TRUNCATION_MESSAGE.length);
    });
  });
  
  describe('sanitizeError', () => {
    it('should sanitize Error objects', () => {
      const error = new Error('Connection failed: api_key=secret123');
      const result = sanitizeError(error);
      expect(result).toBe(`Error: Connection failed: api_key=${CONFIG.SANITIZE_REPLACEMENT}`);
    });
    
    it('should sanitize string errors', () => {
      const error = 'token=abc123456789012345678901234567890';
      const result = sanitizeError(error);
      expect(result).toBe(`token=${CONFIG.SANITIZE_REPLACEMENT}`);
    });
    
    it('should handle unknown error types', () => {
      const error = { some: 'object' };
      const result = sanitizeError(error);
      expect(result).toBe(CONFIG.SANITIZE_REPLACEMENT);
    });
  });
  
  describe('sanitizeHeaders', () => {
    it('should filter and normalize headers from Headers object', () => {
      const headers = new Headers({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer secret',
        'X-Secret': 'value',
        'X-Rate-Limit-Remaining': '99'
      });
      
      const allowed = new Set(['content-type', 'x-rate-limit-remaining']);
      const result = sanitizeHeaders(headers, allowed);
      
      expect(result).toEqual({
        'content-type': 'application/json',
        'x-rate-limit-remaining': '99'
      });
      expect(result).not.toHaveProperty('authorization');
      expect(result).not.toHaveProperty('x-secret');
    });
    
    it('should filter and normalize headers from plain object', () => {
      const headers = {
        'Content-Type': 'text/plain',
        'AUTHORIZATION': 'Bearer token',
        'X-Custom': 'value'
      };
      
      const allowed = new Set(['content-type']);
      const result = sanitizeHeaders(headers, allowed);
      
      expect(result).toEqual({
        'content-type': 'text/plain'
      });
    });
    
    it('should redact sensitive values in allowed headers', () => {
      const headers = {
        'x-rate-limit-remaining': 'Bearer sometoken123456789012345678901234567890'
      };
      
      const allowed = new Set(['x-rate-limit-remaining']);
      const result = sanitizeHeaders(headers, allowed);
      
      expect(result['x-rate-limit-remaining']).toContain(CONFIG.SANITIZE_REPLACEMENT);
    });
  });
  
  describe('isEmptyOrWhitespace', () => {
    it('should return true for undefined', () => {
      expect(isEmptyOrWhitespace(undefined)).toBe(true);
    });
    
    it('should return true for empty string', () => {
      expect(isEmptyOrWhitespace('')).toBe(true);
    });
    
    it('should return true for whitespace only', () => {
      expect(isEmptyOrWhitespace('   \t\n  ')).toBe(true);
    });
    
    it('should return false for non-empty strings', () => {
      expect(isEmptyOrWhitespace('test')).toBe(false);
      expect(isEmptyOrWhitespace('  test  ')).toBe(false);
    });
  });
});