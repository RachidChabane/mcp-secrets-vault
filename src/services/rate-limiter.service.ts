import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import { ToolError } from '../utils/errors.js';
import { isNonEmptyString } from '../utils/validation.js';

interface RateLimitWindow {
  readonly requests: readonly number[];
  readonly windowStart: number;
}

interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: number;
}

export class RateLimiterService {
  private readonly windows = new Map<string, RateLimitWindow>();
  private defaultLimit: number;
  private defaultWindowSeconds: number;
  private cleanupTimer: NodeJS.Timeout;

  constructor(
    defaultLimit: number = CONFIG.DEFAULT_RATE_LIMIT_REQUESTS,
    defaultWindowSeconds: number = CONFIG.DEFAULT_RATE_LIMIT_WINDOW_SECONDS
  ) {
    this.defaultLimit = defaultLimit;
    this.defaultWindowSeconds = defaultWindowSeconds;
    
    // Cleanup old windows periodically
    this.cleanupTimer = setInterval(() => this.cleanup(), CONFIG.RATE_LIMIT_CLEANUP_INTERVAL_MS);
  }

  setDefaultLimit(requests: number, windowSeconds: number): void {
    if (requests <= 0 || !Number.isFinite(requests)) {
      throw new ToolError(
        TEXT.ERROR_INVALID_RATE_LIMIT,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }
    if (windowSeconds <= 0 || !Number.isFinite(windowSeconds)) {
      throw new ToolError(
        TEXT.ERROR_INVALID_RATE_LIMIT,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }
    this.defaultLimit = requests;
    this.defaultWindowSeconds = windowSeconds;
  }

  checkLimit(
    key: string,
    limit: number = this.defaultLimit,
    windowSeconds: number = this.defaultWindowSeconds
  ): RateLimitResult {
    // Validate and trim input
    const trimmedKey = key?.trim();
    if (!isNonEmptyString(trimmedKey)) {
      throw new ToolError(
        TEXT.ERROR_INVALID_REQUEST,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }
    
    // Validate limit and window parameters
    if (limit <= 0 || !Number.isFinite(limit)) {
      throw new ToolError(
        TEXT.ERROR_INVALID_RATE_LIMIT,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }
    
    if (windowSeconds <= 0 || !Number.isFinite(windowSeconds)) {
      throw new ToolError(
        TEXT.ERROR_INVALID_RATE_LIMIT,
        CONFIG.ERROR_CODE_INVALID_REQUEST
      );
    }
    
    const now = Date.now();
    const windowMs = windowSeconds * CONFIG.MILLISECONDS_PER_SECOND;
    const windowStart = now - windowMs;

    let window = this.windows.get(trimmedKey);
    
    if (!window) {
      window = Object.freeze({ 
        requests: Object.freeze([]), 
        windowStart 
      });
      this.windows.set(trimmedKey, window);
    }

    // Remove old requests outside the window
    const activeRequests = window.requests.filter(time => time > windowStart);
    const remaining = limit - activeRequests.length;
    const resetAt = activeRequests.length > 0 && activeRequests[0] !== undefined
      ? activeRequests[0] + windowMs 
      : now + windowMs;

    if (remaining <= 0) {
      return Object.freeze({ 
        allowed: false, 
        remaining: 0, 
        resetAt 
      });
    }

    // Add current request and update window with immutable structure
    const updatedRequests = Object.freeze([...activeRequests, now]);
    const updatedWindow = Object.freeze({
      requests: updatedRequests,
      windowStart
    });
    this.windows.set(trimmedKey, updatedWindow);
    
    return Object.freeze({ 
      allowed: true, 
      remaining: remaining - 1, 
      resetAt 
    });
  }

  private cleanup(): void {
    const now = Date.now();
    const maxAge = this.defaultWindowSeconds * CONFIG.MILLISECONDS_PER_SECOND * CONFIG.RATE_LIMIT_WINDOW_MULTIPLIER;

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
    const trimmedKey = key?.trim();
    if (isNonEmptyString(trimmedKey)) {
      this.windows.delete(trimmedKey);
    }
  }

  resetAll(): void {
    this.windows.clear();
  }
  
  /**
   * Stop the cleanup timer (for testing and shutdown)
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
  
  /**
   * Get the current window count for a key (for testing)
   */
  getWindowCount(key: string): number {
    const trimmedKey = key?.trim();
    if (!isNonEmptyString(trimmedKey)) {
      return 0;
    }
    
    const window = this.windows.get(trimmedKey);
    if (!window) {
      return 0;
    }
    
    const now = Date.now();
    const windowMs = this.defaultWindowSeconds * CONFIG.MILLISECONDS_PER_SECOND;
    const windowStart = now - windowMs;
    
    return window.requests.filter(time => time > windowStart).length;
  }
}