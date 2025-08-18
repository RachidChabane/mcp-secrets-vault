import { z } from 'zod';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';
import { ToolError } from '../utils/errors.js';

/**
 * Check if a ZodError contains a specific path tail
 */
const hasPath = (err: z.ZodError, pathTail: string): boolean =>
  err.issues.some(i => Array.isArray(i.path) && i.path.includes(pathTail));

/**
 * Map ZodError to ToolError with granular error codes
 * Handles nested paths like action.type and action.injectionType
 */
export function mapZodErrorToToolError(error: z.ZodError): ToolError {
  // Check for specific field errors, including nested paths
  const invalidUrl = error.issues.some(i => i.message === TEXT.ERROR_INVALID_URL) || hasPath(error, 'url');
  const invalidHeaders = error.issues.some(i => i.message === TEXT.ERROR_INVALID_HEADERS) || hasPath(error, 'headers');
  const invalidMethod = hasPath(error, 'type');            // matches action.type
  const invalidInjection = hasPath(error, 'injectionType'); // matches action.injectionType

  // Determine the most specific error code
  const code = invalidUrl ? CONFIG.ERROR_CODE_INVALID_URL
    : invalidHeaders ? CONFIG.ERROR_CODE_INVALID_HEADERS
    : invalidMethod ? CONFIG.ERROR_CODE_INVALID_METHOD
    : invalidInjection ? CONFIG.ERROR_CODE_INVALID_INJECTION_TYPE
    : CONFIG.ERROR_CODE_INVALID_REQUEST;

  // Map code to message
  const message = code === CONFIG.ERROR_CODE_INVALID_URL ? TEXT.ERROR_INVALID_URL
    : code === CONFIG.ERROR_CODE_INVALID_HEADERS ? TEXT.ERROR_INVALID_HEADERS
    : code === CONFIG.ERROR_CODE_INVALID_METHOD ? TEXT.ERROR_INVALID_METHOD
    : code === CONFIG.ERROR_CODE_INVALID_INJECTION_TYPE ? TEXT.ERROR_INVALID_INJECTION_TYPE
    : TEXT.ERROR_INVALID_REQUEST;

  return new ToolError(message, code);
}