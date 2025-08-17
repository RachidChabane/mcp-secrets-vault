import { describe, it, expect } from 'vitest';
import { CONFIG } from './config-constants.js';

describe('Config Constants', () => {
  it('should have version defined', () => {
    expect(CONFIG.VERSION).toBe('0.1.0');
    expect(CONFIG.SERVER_VERSION).toBe('0.1.0');
  });

  it('should have HTTP settings defined', () => {
    expect(CONFIG.HTTP_TIMEOUT_MS).toBe(30000);
    expect(CONFIG.HTTP_MAX_REDIRECTS).toBe(5);
  });

  it('should have rate limiting defaults', () => {
    expect(CONFIG.DEFAULT_RATE_LIMIT_REQUESTS).toBe(100);
    expect(CONFIG.DEFAULT_RATE_LIMIT_WINDOW_SECONDS).toBe(3600);
  });

  it('should have audit settings', () => {
    expect(CONFIG.AUDIT_FILE_PREFIX).toBe('audit');
    expect(CONFIG.AUDIT_FILE_EXTENSION).toBe('.jsonl');
    expect(CONFIG.AUDIT_MAX_FILE_SIZE_MB).toBe(100);
  });

  it('should have error codes defined', () => {
    expect(CONFIG.ERROR_CODE_UNKNOWN_SECRET).toBe('unknown_secret');
    expect(CONFIG.ERROR_CODE_FORBIDDEN_DOMAIN).toBe('forbidden_domain');
    expect(CONFIG.ERROR_CODE_RATE_LIMITED).toBe('rate_limited');
  });

  it('should have supported HTTP methods', () => {
    expect(CONFIG.SUPPORTED_HTTP_METHODS).toEqual(['GET', 'POST']);
  });

  it('should have exit codes', () => {
    expect(CONFIG.EXIT_CODE_SUCCESS).toBe(0);
    expect(CONFIG.EXIT_CODE_ERROR).toBe(1);
  });

  it('should enforce max function lines limit', () => {
    expect(CONFIG.MAX_FUNCTION_LINES).toBe(20);
  });
});