import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimiterService } from './rate-limiter.service.js';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import { ToolError } from '../utils/errors.js';

describe('RateLimiterService', () => {
  let rateLimiter: RateLimiterService;

  beforeEach(() => {
    vi.useFakeTimers();
    rateLimiter = new RateLimiterService(5, 60); // 5 requests per 60 seconds
  });

  afterEach(() => {
    vi.useRealTimers();
    if (rateLimiter) {
      rateLimiter.shutdown();
    }
  });

  describe('checkLimit', () => {
    it('should allow requests within limit', () => {
      const key = 'test-key';
      
      for (let i = 0; i < 5; i++) {
        const result = rateLimiter.checkLimit(key);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
        expect(Object.isFrozen(result)).toBe(true); // Check immutability
      }
    });
    
    it('should trim input keys', () => {
      const key = '  test-key  ';
      const trimmedKey = 'test-key';
      
      // Make some requests with spaces
      for (let i = 0; i < 3; i++) {
        rateLimiter.checkLimit(key);
      }
      
      // Should use same window for trimmed key
      const result = rateLimiter.checkLimit(trimmedKey);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1); // 5 - 3 - 1 = 1
    });
    
    it('should throw error for invalid key', () => {
      expect(() => rateLimiter.checkLimit('')).toThrow(ToolError);
      expect(() => rateLimiter.checkLimit('   ')).toThrow(ToolError);
      expect(() => rateLimiter.checkLimit(null as any)).toThrow(ToolError);
      expect(() => rateLimiter.checkLimit(undefined as any)).toThrow(ToolError);
    });
    
    it('should throw error for invalid limit', () => {
      const key = 'test-key';
      expect(() => rateLimiter.checkLimit(key, 0)).toThrow(ToolError);
      expect(() => rateLimiter.checkLimit(key, -1)).toThrow(ToolError);
      expect(() => rateLimiter.checkLimit(key, Infinity)).toThrow(ToolError);
      expect(() => rateLimiter.checkLimit(key, NaN)).toThrow(ToolError);
    });
    
    it('should throw error for invalid window', () => {
      const key = 'test-key';
      expect(() => rateLimiter.checkLimit(key, 5, 0)).toThrow(ToolError);
      expect(() => rateLimiter.checkLimit(key, 5, -1)).toThrow(ToolError);
      expect(() => rateLimiter.checkLimit(key, 5, Infinity)).toThrow(ToolError);
      expect(() => rateLimiter.checkLimit(key, 5, NaN)).toThrow(ToolError);
    });

    it('should deny requests exceeding limit', () => {
      const key = 'test-key';
      
      // Exhaust the limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit(key);
      }
      
      // Next request should be denied
      const result = rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should use sliding window', () => {
      const key = 'test-key';
      const now = Date.now();
      
      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        rateLimiter.checkLimit(key);
      }
      
      // Advance time by 30 seconds
      vi.setSystemTime(now + 30000);
      
      // Make 2 more requests (should reach limit)
      for (let i = 0; i < 2; i++) {
        rateLimiter.checkLimit(key);
      }
      
      // Should be at limit
      let result = rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(false);
      
      // Advance time by 31 seconds (first requests expire)
      vi.setSystemTime(now + 61000);
      
      // Should allow new requests
      result = rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2); // 2 requests still in window, 3 allowed now
    });

    it('should handle different keys independently', () => {
      const key1 = 'key1';
      const key2 = 'key2';
      
      // Exhaust limit for key1
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit(key1);
      }
      
      // key2 should still have full limit
      const result = rateLimiter.checkLimit(key2);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should provide correct resetAt time', () => {
      const key = 'test-key';
      const now = Date.now();
      
      const firstResult = rateLimiter.checkLimit(key);
      expect(firstResult.resetAt).toBeGreaterThan(now);
      expect(firstResult.resetAt).toBeLessThanOrEqual(now + 60000);
      
      // Exhaust limit
      for (let i = 0; i < 4; i++) {
        rateLimiter.checkLimit(key);
      }
      
      const deniedResult = rateLimiter.checkLimit(key);
      expect(deniedResult.allowed).toBe(false);
      expect(deniedResult.resetAt).toBe(firstResult.resetAt);
    });
  });

  describe('reset', () => {
    it('should reset limit for specific key', () => {
      const key = 'test-key';
      
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit(key);
      }
      
      // Should be denied
      let result = rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(false);
      
      // Reset the key
      rateLimiter.reset(key);
      
      // Should allow requests again
      result = rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });
    
    it('should handle trimming in reset', () => {
      const key = '  test-key  ';
      const trimmedKey = 'test-key';
      
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkLimit(trimmedKey);
      }
      
      // Reset with spaces should work
      rateLimiter.reset(key);
      
      // Should allow requests again
      const result = rateLimiter.checkLimit(trimmedKey);
      expect(result.allowed).toBe(true);
    });
    
    it('should handle invalid keys gracefully', () => {
      // Should not throw
      expect(() => rateLimiter.reset('')).not.toThrow();
      expect(() => rateLimiter.reset('  ')).not.toThrow();
      expect(() => rateLimiter.reset(null as any)).not.toThrow();
    });
  });

  describe('resetAll', () => {
    it('should reset all keys', () => {
      const keys = ['key1', 'key2', 'key3'];
      
      // Exhaust limits for all keys
      keys.forEach(key => {
        for (let i = 0; i < 5; i++) {
          rateLimiter.checkLimit(key);
        }
      });
      
      // All should be denied
      keys.forEach(key => {
        const result = rateLimiter.checkLimit(key);
        expect(result.allowed).toBe(false);
      });
      
      // Reset all
      rateLimiter.resetAll();
      
      // All should allow requests again
      keys.forEach(key => {
        const result = rateLimiter.checkLimit(key);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4);
      });
    });
  });

  describe('cleanup', () => {
    it('should clean up old windows periodically', () => {
      const key = 'test-key';
      const now = Date.now();
      
      // Make a request
      rateLimiter.checkLimit(key);
      
      // Advance time beyond cleanup threshold (2x window)
      vi.setSystemTime(now + (130 * CONFIG.MILLISECONDS_PER_SECOND)); // 130 seconds
      
      // Trigger cleanup
      vi.runOnlyPendingTimers();
      
      // Should have fresh limit
      const result = rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });
  });

  describe('default configuration', () => {
    it('should use default config values', () => {
      const defaultLimiter = new RateLimiterService();
      const key = 'test-key';
      
      // Should use DEFAULT_RATE_LIMIT_REQUESTS
      for (let i = 0; i < CONFIG.DEFAULT_RATE_LIMIT_REQUESTS; i++) {
        const result = defaultLimiter.checkLimit(key);
        expect(result.allowed).toBe(true);
      }
      
      // Next should be denied
      const result = defaultLimiter.checkLimit(key);
      expect(result.allowed).toBe(false);
      
      // Cleanup
      defaultLimiter.shutdown();
    });
  });
  
  describe('getWindowCount', () => {
    it('should return current request count in window', () => {
      const key = 'test-key';
      
      expect(rateLimiter.getWindowCount(key)).toBe(0);
      
      rateLimiter.checkLimit(key);
      expect(rateLimiter.getWindowCount(key)).toBe(1);
      
      rateLimiter.checkLimit(key);
      expect(rateLimiter.getWindowCount(key)).toBe(2);
    });
    
    it('should handle trimming', () => {
      const key = '  test-key  ';
      const trimmedKey = 'test-key';
      
      rateLimiter.checkLimit(trimmedKey);
      rateLimiter.checkLimit(trimmedKey);
      
      expect(rateLimiter.getWindowCount(key)).toBe(2);
    });
    
    it('should return 0 for invalid keys', () => {
      expect(rateLimiter.getWindowCount('')).toBe(0);
      expect(rateLimiter.getWindowCount('  ')).toBe(0);
      expect(rateLimiter.getWindowCount(null as any)).toBe(0);
    });
    
    it('should return 0 for non-existent keys', () => {
      expect(rateLimiter.getWindowCount('nonexistent')).toBe(0);
    });
  });
  
  describe('shutdown', () => {
    it('should stop cleanup timer', () => {
      // The shutdown method should work without error
      expect(() => rateLimiter.shutdown()).not.toThrow();
      
      // After shutdown, the limiter should still work (just without cleanup)
      const key = 'test-after-shutdown';
      const result = rateLimiter.checkLimit(key);
      expect(result.allowed).toBe(true);
    });
  });
  
  describe('immutability', () => {
    it('should return immutable results', () => {
      const key = 'test-key';
      const result = rateLimiter.checkLimit(key);
      
      expect(Object.isFrozen(result)).toBe(true);
      expect(() => {
        (result as any).allowed = false;
      }).toThrow();
    });
  });
  
  describe('security', () => {
    it('should never expose sensitive data in errors', () => {
      const sensitiveKey = 'secret_api_key_12345';
      
      try {
        rateLimiter.checkLimit('', 10, 60);
      } catch (error: any) {
        expect(error.message).not.toContain(sensitiveKey);
        expect(error.message).toBe(TEXT.ERROR_INVALID_REQUEST);
      }
      
      try {
        rateLimiter.checkLimit('key', 0);
      } catch (error: any) {
        expect(error.message).toBe(TEXT.ERROR_INVALID_RATE_LIMIT);
      }
    });
  });
});