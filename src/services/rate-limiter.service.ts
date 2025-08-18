import { CONFIG } from '../constants/config-constants.js';

interface RateLimitWindow {
  requests: number[];
  windowStart: number;
}

export class RateLimiterService {
  private readonly windows = new Map<string, RateLimitWindow>();
  private readonly defaultLimit: number;
  private readonly defaultWindowSeconds: number;

  constructor(
    defaultLimit: number = CONFIG.DEFAULT_RATE_LIMIT_REQUESTS,
    defaultWindowSeconds: number = CONFIG.DEFAULT_RATE_LIMIT_WINDOW_SECONDS
  ) {
    this.defaultLimit = defaultLimit;
    this.defaultWindowSeconds = defaultWindowSeconds;
    
    // Cleanup old windows periodically
    setInterval(() => this.cleanup(), CONFIG.RATE_LIMIT_CLEANUP_INTERVAL_MS);
  }

  checkLimit(
    key: string,
    limit: number = this.defaultLimit,
    windowSeconds: number = this.defaultWindowSeconds
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = now - windowMs;

    let window = this.windows.get(key);
    
    if (!window) {
      window = { requests: [], windowStart };
      this.windows.set(key, window);
    }

    // Remove old requests outside the window
    window.requests = window.requests.filter(time => time > windowStart);

    const remaining = limit - window.requests.length;
    const resetAt = window.requests.length > 0 && window.requests[0] !== undefined
      ? window.requests[0] + windowMs 
      : now + windowMs;

    if (remaining <= 0) {
      return { allowed: false, remaining: 0, resetAt };
    }

    // Add current request
    window.requests.push(now);
    
    return { allowed: true, remaining: remaining - 1, resetAt };
  }

  private cleanup(): void {
    const now = Date.now();
    const maxAge = this.defaultWindowSeconds * 1000 * 2;

    for (const [key, window] of this.windows.entries()) {
      const hasRecentRequests = window.requests.some(
        time => time > now - maxAge
      );
      
      if (!hasRecentRequests) {
        this.windows.delete(key);
      }
    }
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  resetAll(): void {
    this.windows.clear();
  }
}