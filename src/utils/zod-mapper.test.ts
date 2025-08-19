import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import { mapZodErrorToToolError } from './zod-mapper.js';

describe('mapZodErrorToToolError', () => {
  describe('Nested path handling', () => {
    it('maps nested action.type to INVALID_METHOD', () => {
      const error = new z.ZodError([{
        path: ['action', 'type'],
        message: 'Invalid enum value',
        code: 'invalid_enum_value',
        received: 'DELETE',
        options: ['http_get', 'http_post']
      } as z.ZodIssue]);
      
      const toolError = mapZodErrorToToolError(error);
      expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_METHOD);
      expect(toolError.message).toBe(TEXT.ERROR_INVALID_METHOD);
    });

    it('maps nested action.injectionType to INVALID_INJECTION_TYPE', () => {
      const error = new z.ZodError([{
        path: ['action', 'injectionType'],
        message: 'Invalid enum value',
        code: 'invalid_enum_value',
        received: 'custom',
        options: ['bearer', 'header']
      } as z.ZodIssue]);
      
      const toolError = mapZodErrorToToolError(error);
      expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_INJECTION_TYPE);
      expect(toolError.message).toBe(TEXT.ERROR_INVALID_INJECTION_TYPE);
    });
    
    it('maps deeply nested type path to INVALID_METHOD', () => {
      const error = new z.ZodError([{
        path: ['request', 'action', 'type'],
        message: 'Invalid value',
        code: 'custom'
      }]);
      
      const toolError = mapZodErrorToToolError(error);
      expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_METHOD);
      expect(toolError.message).toBe(TEXT.ERROR_INVALID_METHOD);
    });
  });
  
  describe('URL validation', () => {
    it('maps URL errors to INVALID_URL by message', () => {
      const error = new z.ZodError([{
        path: ['url'],
        message: TEXT.ERROR_INVALID_URL,
        code: 'custom'
      }]);
      
      const toolError = mapZodErrorToToolError(error);
      expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_URL);
      expect(toolError.message).toBe(TEXT.ERROR_INVALID_URL);
    });
    
    it('maps URL errors to INVALID_URL by path', () => {
      const error = new z.ZodError([{
        path: ['action', 'url'],
        message: 'Invalid format',
        code: 'custom'
      }]);
      
      const toolError = mapZodErrorToToolError(error);
      expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_URL);
      expect(toolError.message).toBe(TEXT.ERROR_INVALID_URL);
    });
  });
  
  describe('Headers validation', () => {
    it('maps headers errors to INVALID_HEADERS by message', () => {
      const error = new z.ZodError([{
        path: ['headers'],
        message: TEXT.ERROR_INVALID_HEADERS,
        code: 'custom'
      }]);
      
      const toolError = mapZodErrorToToolError(error);
      expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_HEADERS);
      expect(toolError.message).toBe(TEXT.ERROR_INVALID_HEADERS);
    });
    
    it('maps headers errors to INVALID_HEADERS by path', () => {
      const error = new z.ZodError([{
        path: ['action', 'headers', 'content-type'],
        message: 'Invalid header',
        code: 'custom'
      }]);
      
      const toolError = mapZodErrorToToolError(error);
      expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_HEADERS);
      expect(toolError.message).toBe(TEXT.ERROR_INVALID_HEADERS);
    });
  });
  
  describe('Fallback behavior', () => {
    it('falls back to INVALID_REQUEST for unknown errors', () => {
      const error = new z.ZodError([{
        path: ['unknown', 'field'],
        message: 'Some error',
        code: 'custom'
      }]);
      
      const toolError = mapZodErrorToToolError(error);
      expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
      expect(toolError.message).toBe(TEXT.ERROR_INVALID_REQUEST);
    });
    
    it('handles empty path arrays', () => {
      const error = new z.ZodError([{
        path: [],
        message: 'Root level error',
        code: 'custom'
      }]);
      
      const toolError = mapZodErrorToToolError(error);
      expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
      expect(toolError.message).toBe(TEXT.ERROR_INVALID_REQUEST);
    });
  });
  
  describe('Priority handling', () => {
    it('prioritizes URL errors over other errors', () => {
      const error = new z.ZodError([
        {
          path: ['something'],
          message: 'Some error',
          code: 'custom'
        },
        {
          path: ['url'],
          message: TEXT.ERROR_INVALID_URL,
          code: 'custom'
        }
      ]);
      
      const toolError = mapZodErrorToToolError(error);
      expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_URL);
      expect(toolError.message).toBe(TEXT.ERROR_INVALID_URL);
    });
    
    it('checks all issues for matching patterns', () => {
      const error = new z.ZodError([
        {
          path: ['field1'],
          message: 'Error 1',
          code: 'custom'
        },
        {
          path: ['field2'],
          message: 'Error 2',
          code: 'custom'
        },
        {
          path: ['action', 'type'],
          message: 'Invalid type',
          code: 'invalid_enum_value',
          received: 'DELETE',
          options: ['GET', 'POST']
        } as z.ZodIssue
      ]);
      
      const toolError = mapZodErrorToToolError(error);
      expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_METHOD);
      expect(toolError.message).toBe(TEXT.ERROR_INVALID_METHOD);
    });
  });
  
  describe('ToolError properties', () => {
    it('creates ToolError with correct structure', () => {
      const error = new z.ZodError([{
        path: ['test'],
        message: 'Test error',
        code: 'custom'
      }]);
      
      const toolError = mapZodErrorToToolError(error);
      expect(toolError).toHaveProperty('message');
      expect(toolError).toHaveProperty('code');
      expect(toolError.name).toBe('ToolError');
    });
  });
});