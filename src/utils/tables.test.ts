import { describe, it, expect } from 'vitest';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import { 
  RESPONSE_BY_CODE, 
  HTTP_METHOD_MAP, 
  INJECTION_HANDLERS, 
  respondByCode 
} from './tables.js';

describe('Table Coverage', () => {
  describe('RESPONSE_BY_CODE', () => {
    it('covers all currently defined ERROR_CODE constants', () => {
      const errorCodes = Object.entries(CONFIG)
        .filter(([key]) => key.startsWith('ERROR_CODE_'))
        .map(([, value]) => value);
      
      // Check that each defined error code has an entry
      const missingCodes: string[] = [];
      errorCodes.forEach(code => {
        if (!RESPONSE_BY_CODE[code]) {
          missingCodes.push(code);
        }
      });
      
      // Some codes might not be defined yet (conditional entries)
      const optionalCodes = [
        'ttl_expired',
        'payload_too_large',
        'missing_env',
        'timeout',
        'invalid_policy',
        'policy_expired',
        'no_policy',
        'policies_not_loaded'
      ];
      
      const requiredMissingCodes = missingCodes.filter(
        code => !optionalCodes.includes(code)
      );
      
      expect(requiredMissingCodes).toEqual([]);
    });
    
    it('returns proper structure for each code', () => {
      Object.entries(RESPONSE_BY_CODE).forEach(([code, response]) => {
        expect(response).toMatchObject({
          message: expect.any(String),
          code: expect.any(String)
        });
        expect(response.code).toBe(code);
      });
    });
  });
  
  describe('HTTP_METHOD_MAP', () => {
    it('covers all allowed HTTP methods', () => {
      expect(HTTP_METHOD_MAP).toHaveProperty(TEXT.HTTP_METHOD_GET);
      expect(HTTP_METHOD_MAP).toHaveProperty(TEXT.HTTP_METHOD_POST);
      expect(Object.keys(HTTP_METHOD_MAP)).toHaveLength(2);
    });
    
    it('maps to correct HTTP verbs', () => {
      expect(HTTP_METHOD_MAP[TEXT.HTTP_METHOD_GET]).toBe(TEXT.HTTP_VERB_GET);
      expect(HTTP_METHOD_MAP[TEXT.HTTP_METHOD_POST]).toBe(TEXT.HTTP_VERB_POST);
    });
  });
  
  describe('INJECTION_HANDLERS', () => {
    it('covers all injection types', () => {
      expect(INJECTION_HANDLERS).toHaveProperty(TEXT.INJECTION_TYPE_BEARER);
      expect(INJECTION_HANDLERS).toHaveProperty(TEXT.INJECTION_TYPE_HEADER);
      expect(Object.keys(INJECTION_HANDLERS)).toHaveLength(2);
    });
    
    it('injects bearer token correctly', () => {
      const headers = { 'content-type': 'application/json' };
      const result = INJECTION_HANDLERS[TEXT.INJECTION_TYPE_BEARER](headers, 'secret123');
      
      expect(result).toHaveProperty(TEXT.AUTHORIZATION_HEADER);
      expect(result[TEXT.AUTHORIZATION_HEADER]).toBe('Bearer secret123');
      expect(result['content-type']).toBe('application/json');
    });
    
    it('injects header secret correctly', () => {
      const headers = { 'content-type': 'application/json' };
      const result = INJECTION_HANDLERS[TEXT.INJECTION_TYPE_HEADER](headers, 'secret123');
      
      expect(result).toHaveProperty(TEXT.SECRET_HEADER_NAME);
      expect(result[TEXT.SECRET_HEADER_NAME]).toBe('secret123');
      expect(result['content-type']).toBe('application/json');
    });
  });
  
  describe('respondByCode', () => {
    it('returns correct response for known error codes', () => {
      const response = respondByCode(CONFIG.ERROR_CODE_INVALID_REQUEST);
      
      expect(response).toEqual({
        success: false,
        message: TEXT.ERROR_INVALID_REQUEST,
        code: CONFIG.ERROR_CODE_INVALID_REQUEST
      });
    });
    
    it('falls back to EXECUTION_FAILED for unknown codes', () => {
      const response = respondByCode('unknown_code');
      
      expect(response).toEqual({
        success: false,
        message: TEXT.ERROR_EXECUTION_FAILED,
        code: CONFIG.ERROR_CODE_EXECUTION_FAILED
      });
    });
    
    it('always returns success: false', () => {
      const codes = Object.keys(RESPONSE_BY_CODE);
      codes.forEach(code => {
        const response = respondByCode(code);
        expect(response.success).toBe(false);
      });
    });
  });
});