import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimiterService } from './rate-limiter.service.js';
import { CONFIG } from '../constants/config-constants.js';

describe('RateLimiterService', () => {
  let rateLimiter: RateLimiterService;

  beforeEach(() => {
    vi.useFakeTimers();
    rateLimiter = new RateLimiterService(5, 60); // 5 requests per 60 seconds
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkLimit', () => {
    it('should allow requests within limit', () => {
      const key = 'test-key';
      
      for (let i = 0; i < 5; i++) {
        const result = rateLimiter.checkLimit(key);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }
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
      vi.setSystemTime(now + 130000); // 130 seconds
      
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
    });
  });
});