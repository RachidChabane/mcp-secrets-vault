import { describe, it, expect } from 'vitest';
import { TEXT } from './text-constants.js';

describe('Text Constants', () => {
  it('should have error messages defined', () => {
    expect(TEXT.ERROR_UNKNOWN_SECRET).toBe('Secret not found');
    expect(TEXT.ERROR_FORBIDDEN_DOMAIN).toBe('Domain not allowed by policy');
    expect(TEXT.ERROR_INVALID_REQUEST).toBe('Invalid request format');
  });

  it('should have success messages defined', () => {
    expect(TEXT.SUCCESS_REQUEST_COMPLETED).toBe('Request completed successfully');
    expect(TEXT.SUCCESS_POLICY_LOADED).toBe('Policy loaded successfully');
  });

  it('should have field names defined', () => {
    expect(TEXT.FIELD_SECRET_ID).toBe('secretId');
    expect(TEXT.FIELD_ACTION).toBe('action');
    expect(TEXT.FIELD_DOMAIN).toBe('domain');
  });

  it('should have tool names defined', () => {
    expect(TEXT.TOOL_DISCOVER).toBe('discover_secrets');
    expect(TEXT.TOOL_DESCRIBE).toBe('describe_policy');
    expect(TEXT.TOOL_USE).toBe('use_secret');
    expect(TEXT.TOOL_AUDIT).toBe('query_audit');
  });

  it('should have unique values for all constants (allowing legitimate contextual duplicates)', () => {
    const values = Object.values(TEXT);
    const uniqueValues = new Set(values);
    
    // Allow specific legitimate duplicate values that are used in different contexts
    const legitimateDuplicates = [
      'error' // Used by both FIELD_ERROR (JSON key) and AUDIT_OUTCOME_ERROR (audit value)
    ];
    
    const expectedDuplicates = values.filter(value => 
      legitimateDuplicates.includes(value as string)
    ).length - legitimateDuplicates.length;
    
    expect(uniqueValues.size).toBe(values.length - expectedDuplicates);
  });
});