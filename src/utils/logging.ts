import { CONFIG } from '../constants/config-constants.js';

interface LogContext {
  level?: typeof CONFIG.LOG_LEVEL_DEBUG | typeof CONFIG.LOG_LEVEL_INFO | typeof CONFIG.LOG_LEVEL_WARN | typeof CONFIG.LOG_LEVEL_ERROR;
  [key: string]: unknown;
}

const REDACTION_PATTERNS = [
  /\b[A-Z][A-Z0-9_]*_KEY\b/gi,
  /\b[A-Z][A-Z0-9_]*_SECRET\b/gi,
  /\b[A-Z][A-Z0-9_]*_TOKEN\b/gi,
  /\b[A-Z][A-Z0-9_]*_PASSWORD\b/gi,
  /\b[A-Z][A-Z0-9_]*_API_[A-Z0-9_]*\b/gi,
  /authorization:\s*["']?[^"'\s,}]+["']?/gi,
  /bearer\s+[a-zA-Z0-9\-._~+\/]+=*/gi,
  /"envVar":\s*"[^"]+"/g,
  /"env":\s*"[^"]+"/g,
  /=[a-zA-Z0-9\-._~+\/]{8,}/g, // Redact values after equals sign
];

const SENSITIVE_KEYS = [
  'envvar',
  'secret',
  'password',
  'token',
  'auth',
  'authorization',
  'bearer',
  'apikey',
  'api_key',
  'secretvalue',
  'credential',
  'credentials',
  'error', // Redact error stacks
];

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    let redacted = value;
    
    // Special handling for error stacks
    if (value.includes(CONFIG.STACK_TRACE_PATTERN)) {
      // Remove stack traces
      redacted = redacted.split('\n')[0] || CONFIG.EMPTY_STRING_FALLBACK; // Keep only first line
    }
    
    for (const pattern of REDACTION_PATTERNS) {
      redacted = redacted.replace(pattern, CONFIG.SANITIZE_REPLACEMENT);
    }
    return redacted;
  }
  
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  
  if (value && typeof value === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      
      // Check if entire key should be redacted
      if (lowerKey === 'env' || lowerKey === 'envvar' ||
          SENSITIVE_KEYS.some(sensitive => {
            const lowerSensitive = sensitive.toLowerCase();
            return lowerKey === lowerSensitive || 
                   (lowerKey.includes(lowerSensitive) && !CONFIG.EXCEPTION_FIELD_NAMES.includes(key as any));
          })) {
        redacted[key] = CONFIG.SANITIZE_REPLACEMENT;
      } else if (key === 'environment' && typeof val === 'object' && val !== null) {
        // Special handling for environment objects
        const envRedacted: Record<string, unknown> = {};
        for (const [envKey, envVal] of Object.entries(val)) {
          if (CONFIG.SENSITIVE_KEY_PATTERNS.some(pattern => envKey.includes(pattern))) {
            envRedacted[envKey] = CONFIG.SANITIZE_REPLACEMENT;
          } else {
            envRedacted[envKey] = envVal;
          }
        }
        redacted[key] = envRedacted;
      } else {
        redacted[key] = redactValue(val);
      }
    }
    return redacted;
  }
  
  return value;
}

export function writeError(message: string, context: LogContext = {}): void {
  const { level = CONFIG.LOG_LEVEL_ERROR, ...rest } = context;
  
  const redactedRest = redactValue(rest);
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: redactValue(message),
    ...(typeof redactedRest === 'object' && redactedRest !== null ? redactedRest : {})
  };
  
  // Write to stderr as structured JSON
  console.error(JSON.stringify(logEntry));
}