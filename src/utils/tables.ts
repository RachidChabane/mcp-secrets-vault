import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';

// Response type for tool responses
interface ToolResponse {
  success: false;
  error: string;
  code: string;
}

// Response mapping for every ERROR_CODE
export const RESPONSE_BY_CODE: Record<string, { message: string; code: string }> = {
  [CONFIG.ERROR_CODE_UNKNOWN_SECRET]: { 
    message: TEXT.ERROR_UNKNOWN_SECRET, 
    code: CONFIG.ERROR_CODE_UNKNOWN_SECRET 
  },
  [CONFIG.ERROR_CODE_FORBIDDEN_DOMAIN]: { 
    message: TEXT.ERROR_FORBIDDEN_DOMAIN, 
    code: CONFIG.ERROR_CODE_FORBIDDEN_DOMAIN 
  },
  [CONFIG.ERROR_CODE_FORBIDDEN_ACTION]: { 
    message: TEXT.ERROR_FORBIDDEN_ACTION, 
    code: CONFIG.ERROR_CODE_FORBIDDEN_ACTION 
  },
  [CONFIG.ERROR_CODE_RATE_LIMITED]: { 
    message: TEXT.ERROR_RATE_LIMITED, 
    code: CONFIG.ERROR_CODE_RATE_LIMITED 
  },
  [CONFIG.ERROR_CODE_INVALID_REQUEST]: { 
    message: TEXT.ERROR_INVALID_REQUEST, 
    code: CONFIG.ERROR_CODE_INVALID_REQUEST 
  },
  [CONFIG.ERROR_CODE_UNKNOWN_TOOL]: { 
    message: TEXT.ERROR_UNKNOWN_TOOL, 
    code: CONFIG.ERROR_CODE_UNKNOWN_TOOL 
  },
  [CONFIG.ERROR_CODE_DUPLICATE_TOOL]: { 
    message: TEXT.ERROR_DUPLICATE_TOOL, 
    code: CONFIG.ERROR_CODE_DUPLICATE_TOOL 
  },
  [CONFIG.ERROR_CODE_INVALID_METHOD]: { 
    message: TEXT.ERROR_INVALID_METHOD, 
    code: CONFIG.ERROR_CODE_INVALID_METHOD 
  },
  [CONFIG.ERROR_CODE_INVALID_INJECTION_TYPE]: { 
    message: TEXT.ERROR_INVALID_INJECTION_TYPE, 
    code: CONFIG.ERROR_CODE_INVALID_INJECTION_TYPE 
  },
  [CONFIG.ERROR_CODE_INVALID_URL]: { 
    message: TEXT.ERROR_INVALID_URL, 
    code: CONFIG.ERROR_CODE_INVALID_URL 
  },
  [CONFIG.ERROR_CODE_INVALID_HEADERS]: { 
    message: TEXT.ERROR_INVALID_HEADERS, 
    code: CONFIG.ERROR_CODE_INVALID_HEADERS 
  },
  [CONFIG.ERROR_CODE_EXECUTION_FAILED]: { 
    message: TEXT.ERROR_EXECUTION_FAILED, 
    code: CONFIG.ERROR_CODE_EXECUTION_FAILED 
  },
  // Conditionally add codes that may not exist yet
  ...(CONFIG.ERROR_CODE_TTL_EXPIRED ? {
    [CONFIG.ERROR_CODE_TTL_EXPIRED]: { 
      message: (TEXT as any).ERROR_TTL_EXPIRED || TEXT.ERROR_EXECUTION_FAILED, 
      code: CONFIG.ERROR_CODE_TTL_EXPIRED 
    }
  } : {}),
  ...(CONFIG.ERROR_CODE_PAYLOAD_TOO_LARGE ? {
    [CONFIG.ERROR_CODE_PAYLOAD_TOO_LARGE]: { 
      message: (TEXT as any).ERROR_PAYLOAD_TOO_LARGE || TEXT.ERROR_EXECUTION_FAILED, 
      code: CONFIG.ERROR_CODE_PAYLOAD_TOO_LARGE 
    }
  } : {}),
  ...(CONFIG.ERROR_CODE_MISSING_ENV ? {
    [CONFIG.ERROR_CODE_MISSING_ENV]: { 
      message: (TEXT as any).ERROR_MISSING_ENV || TEXT.ERROR_EXECUTION_FAILED, 
      code: CONFIG.ERROR_CODE_MISSING_ENV 
    }
  } : {}),
  ...(CONFIG.ERROR_CODE_TIMEOUT ? {
    [CONFIG.ERROR_CODE_TIMEOUT]: { 
      message: (TEXT as any).ERROR_TIMEOUT || TEXT.ERROR_EXECUTION_FAILED, 
      code: CONFIG.ERROR_CODE_TIMEOUT 
    }
  } : {}),
  ...(CONFIG.ERROR_CODE_INVALID_POLICY ? {
    [CONFIG.ERROR_CODE_INVALID_POLICY]: { 
      message: (TEXT as any).ERROR_INVALID_POLICY || TEXT.ERROR_EXECUTION_FAILED, 
      code: CONFIG.ERROR_CODE_INVALID_POLICY 
    }
  } : {}),
  ...(CONFIG.ERROR_CODE_POLICY_EXPIRED ? {
    [CONFIG.ERROR_CODE_POLICY_EXPIRED]: { 
      message: (TEXT as any).ERROR_POLICY_EXPIRED || TEXT.ERROR_EXECUTION_FAILED, 
      code: CONFIG.ERROR_CODE_POLICY_EXPIRED 
    }
  } : {}),
  ...(CONFIG.ERROR_CODE_NO_POLICY ? {
    [CONFIG.ERROR_CODE_NO_POLICY]: { 
      message: (TEXT as any).ERROR_NO_POLICY || TEXT.ERROR_EXECUTION_FAILED, 
      code: CONFIG.ERROR_CODE_NO_POLICY 
    }
  } : {}),
  ...(CONFIG.ERROR_CODE_POLICIES_NOT_LOADED ? {
    [CONFIG.ERROR_CODE_POLICIES_NOT_LOADED]: { 
      message: (TEXT as any).ERROR_POLICIES_NOT_LOADED || TEXT.ERROR_EXECUTION_FAILED, 
      code: CONFIG.ERROR_CODE_POLICIES_NOT_LOADED 
    }
  } : {}),
} as const;

// HTTP method mapping
export const HTTP_METHOD_MAP = {
  [TEXT.HTTP_METHOD_GET]: TEXT.HTTP_VERB_GET,
  [TEXT.HTTP_METHOD_POST]: TEXT.HTTP_VERB_POST,
} as const;

// Injection handlers
export const INJECTION_HANDLERS = {
  [TEXT.INJECTION_TYPE_BEARER]: (headers: Record<string, string>, value: string) => ({
    ...headers,
    [TEXT.AUTHORIZATION_HEADER]: `Bearer ${value}`
  }),
  [TEXT.INJECTION_TYPE_HEADER]: (headers: Record<string, string>, value: string) => ({
    ...headers,
    [TEXT.SECRET_HEADER_NAME]: value
  }),
} as const;

// Log level mapping
export const LOG_LEVEL_MAP = {
  error: CONFIG.LOG_LEVEL_ERROR,
  warn: CONFIG.LOG_LEVEL_WARN,
  info: CONFIG.LOG_LEVEL_INFO,
  debug: CONFIG.LOG_LEVEL_DEBUG,
} as const;

// One-liner response helper
export function respondByCode(code: string): ToolResponse {
  const response = RESPONSE_BY_CODE[code] || RESPONSE_BY_CODE[CONFIG.ERROR_CODE_EXECUTION_FAILED];
  // Response should always exist due to fallback, but TypeScript doesn't know that
  const message = response?.message || TEXT.ERROR_EXECUTION_FAILED;
  const responseCode = response?.code || CONFIG.ERROR_CODE_EXECUTION_FAILED;
  return {
    success: false,
    error: message,
    code: responseCode
  };
}