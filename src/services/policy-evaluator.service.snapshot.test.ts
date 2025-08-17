import { describe, it, expect } from 'vitest';
import { PolicyEvaluatorService } from './policy-evaluator.service.js';
import { PolicyConfig } from '../interfaces/policy.interface.js';

describe('PolicyEvaluatorService Snapshots', () => {
  const testPolicies: PolicyConfig[] = [
    {
      secretId: 'test-key',
      allowedActions: ['http_get'],
      allowedDomains: ['api.example.com']
    },
    {
      secretId: 'expired-key',
      allowedActions: ['http_get'],
      allowedDomains: ['api.example.com'],
      expiresAt: '2020-01-01T00:00:00Z'
    }
  ];

  const evaluator = new PolicyEvaluatorService(testPolicies);

  it('should match snapshot for no policy error', () => {
    const result = evaluator.evaluate('unknown', 'http_get', 'api.example.com');
    
    expect(result).toMatchInlineSnapshot(`
      {
        "allowed": false,
        "code": "no_policy",
        "message": "Policy not found for secret",
      }
    `);
  });

  it('should match snapshot for invalid request', () => {
    const result = evaluator.evaluate('', '', '');
    
    expect(result).toMatchInlineSnapshot(`
      {
        "allowed": false,
        "code": "invalid_request",
        "message": "Invalid request format",
      }
    `);
  });

  it('should match snapshot for expired policy', () => {
    const result = evaluator.evaluate('expired-key', 'http_get', 'api.example.com');
    
    expect(result).toMatchInlineSnapshot(`
      {
        "allowed": false,
        "code": "policy_expired",
        "message": "Policy has expired",
      }
    `);
  });

  it('should match snapshot for forbidden domain', () => {
    const result = evaluator.evaluate('test-key', 'http_get', 'evil.com');
    
    expect(result).toMatchInlineSnapshot(`
      {
        "allowed": false,
        "code": "forbidden_domain",
        "message": "Domain not allowed by policy",
      }
    `);
  });

  it('should match snapshot for forbidden action', () => {
    const result = evaluator.evaluate('test-key', 'http_post', 'api.example.com');
    
    expect(result).toMatchInlineSnapshot(`
      {
        "allowed": false,
        "code": "forbidden_action",
        "message": "Action not allowed by policy",
      }
    `);
  });

  it('should match snapshot for unsupported action', () => {
    const result = evaluator.evaluate('test-key', 'http_delete', 'api.example.com');
    
    expect(result).toMatchInlineSnapshot(`
      {
        "allowed": false,
        "code": "forbidden_action",
        "message": "Unsupported action",
      }
    `);
  });

  it('should match snapshot for successful evaluation', () => {
    const result = evaluator.evaluate('test-key', 'http_get', 'api.example.com');
    
    expect(result).toMatchInlineSnapshot(`
      {
        "allowed": true,
      }
    `);
  });
});