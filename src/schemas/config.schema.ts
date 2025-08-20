import { z } from 'zod';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';

// Custom refinement to explicitly reject wildcard patterns
const exactFqdnString = z.string()
  .min(CONFIG.MIN_DOMAIN_LENGTH)
  .max(CONFIG.MAX_DOMAIN_LENGTH)
  .toLowerCase()
  .refine(
    (domain) => {
      // Explicitly reject any wildcard patterns
      if (domain.includes('*') || domain.includes('?') || domain.includes('[')) {
        return false;
      }
      // Reject trailing dots and embedded whitespace
      if (domain.endsWith('.') || /\s/.test(domain)) {
        return false;
      }
      // Must match exact FQDN pattern
      return CONFIG.DOMAIN_REGEX.test(domain);
    },
    {
      message: "Wildcards not allowed. Use exact FQDNs only (e.g., 'api.example.com')"
    }
  );

// Secret mapping schema
const SecretMappingSchema = z.object({
  secretId: z.string()
    .min(CONFIG.MIN_SECRET_ID_LENGTH)
    .max(CONFIG.MAX_SECRET_ID_LENGTH)
    .regex(CONFIG.SECRET_ID_REGEX, {
      message: TEXT.ERROR_INVALID_SECRET_ID_FORMAT
    }),
  envVar: z.string()
    .min(CONFIG.MIN_ENV_VAR_LENGTH)
    .regex(CONFIG.ENV_VAR_REGEX, {
      message: "Environment variable must be uppercase with underscores"
    }),
  description: z.string().optional()
});

// Rate limit schema
const RateLimitSchema = z.object({
  requests: z.number().positive().int(),
  windowSeconds: z.number().positive().int()
});

// Policy schema with exact FQDN enforcement
const PolicyConfigSchema = z.object({
  secretId: z.string()
    .min(CONFIG.MIN_SECRET_ID_LENGTH)
    .max(CONFIG.MAX_SECRET_ID_LENGTH)
    .regex(CONFIG.SECRET_ID_REGEX, {
      message: TEXT.ERROR_INVALID_SECRET_ID_FORMAT
    }),
  allowedActions: z.array(
    z.enum(CONFIG.SUPPORTED_ACTIONS as readonly [string, ...string[]])
  ).min(1, {
    message: TEXT.ERROR_EMPTY_ALLOWED_ACTIONS
  }),
  allowedDomains: z.array(exactFqdnString).min(1, {
    message: TEXT.ERROR_EMPTY_ALLOWED_DOMAINS
  }),
  rateLimit: RateLimitSchema.optional(),
  expiresAt: z.string().datetime().optional()
});

// Settings schema
const SettingsSchema = z.object({
  auditDir: z.string().optional(),
  maxFileSizeMb: z.number().positive().optional(),
  maxFileAgeDays: z.number().positive().optional(),
  defaultRateLimit: RateLimitSchema.optional()
}).optional();

// Main config schema
export const VaultConfigSchema = z.object({
  version: z.literal("1.0.0"),
  mappings: z.array(SecretMappingSchema).default([]),
  policies: z.array(PolicyConfigSchema).default([]),
  settings: SettingsSchema
});

// Type exports
export type SecretMappingConfig = z.infer<typeof SecretMappingSchema>;
export type PolicyConfigFromSchema = z.infer<typeof PolicyConfigSchema>;
export type VaultConfig = z.infer<typeof VaultConfigSchema>;

// Frozen config type for immutable configurations
export type FrozenVaultConfig = {
  readonly version: "1.0.0";
  readonly mappings: ReadonlyArray<Readonly<SecretMappingConfig>>;
  readonly policies: ReadonlyArray<Readonly<PolicyConfigFromSchema>>;
  readonly settings?: Readonly<{
    auditDir?: string;
    maxFileSizeMb?: number;
    maxFileAgeDays?: number;
    defaultRateLimit?: Readonly<{
      requests: number;
      windowSeconds: number;
    }>;
  }>;
};

// Validation function with clear error messages
export function validateVaultConfig(data: unknown): VaultConfig {
  try {
    return VaultConfigSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(err => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      });
      throw new Error(`Configuration validation failed:\n${messages.join('\n')}`);
    }
    throw error;
  }
}

// Helper to check if a domain contains wildcards (for explicit validation)
export function containsWildcards(domain: string): boolean {
  return domain.includes('*') || domain.includes('?') || domain.includes('[');
}