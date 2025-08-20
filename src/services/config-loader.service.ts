import { promises as fs } from 'fs';
import { VaultConfig, validateVaultConfig, FrozenVaultConfig } from '../schemas/config.schema.js';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import { ToolError } from '../utils/errors.js';
import { SecretMapping } from '../interfaces/secret-mapping.interface.js';
import { PolicyConfig } from '../interfaces/policy.interface.js';

export interface ConfigLoader {
  loadConfig(): Promise<FrozenVaultConfig>;
  getConfigPath(): string;
}

export class ConfigLoaderService implements ConfigLoader {
  private cachedConfig: FrozenVaultConfig | null = null;
  
  constructor(
    private readonly configPath: string = CONFIG.DEFAULT_CONFIG_FILE
  ) {}

  getConfigPath(): string {
    return this.configPath;
  }

  async loadConfig(): Promise<FrozenVaultConfig> {
    // Return cached config if already loaded
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    try {
      const content = await fs.readFile(this.configPath, CONFIG.DEFAULT_ENCODING);
      const data: unknown = JSON.parse(content);
      
      // Validate and parse config with schema
      const config = validateVaultConfig(data);
      
      // Freeze the config for immutability
      this.cachedConfig = this.freezeConfig(config);
      return this.cachedConfig;
      
    } catch (error: any) {
      // If file doesn't exist, return deny-by-default config
      if (error.code === CONFIG.FS_ERROR_ENOENT) {
        const defaultConfig: VaultConfig = {
          version: "1.0.0",
          mappings: [],
          policies: [],
          settings: undefined
        };
        this.cachedConfig = this.freezeConfig(defaultConfig);
        return this.cachedConfig;
      }
      
      // Handle JSON parse errors
      if (error instanceof SyntaxError) {
        throw new ToolError(
          `${TEXT.ERROR_INVALID_CONFIG}: Invalid JSON in ${this.configPath}`,
          CONFIG.ERROR_CODE_INVALID_REQUEST
        );
      }
      
      // Handle validation errors
      if (error.message?.includes('Configuration validation failed')) {
        throw new ToolError(
          error.message,
          CONFIG.ERROR_CODE_INVALID_REQUEST
        );
      }
      
      throw error;
    }
  }

  private freezeConfig(config: VaultConfig): FrozenVaultConfig {
    // Deep freeze mappings
    const frozenMappings = config.mappings.map(mapping => 
      Object.freeze({
        secretId: mapping.secretId.trim(),
        envVar: mapping.envVar.trim(),
        description: mapping.description?.trim()
      } as SecretMapping)
    );

    // Deep freeze policies with normalized domains and actions
    const frozenPolicies = config.policies.map(policy => {
      const frozen: any = {
        secretId: policy.secretId.trim(),
        allowedActions: Object.freeze(
          [...new Set(policy.allowedActions.map(a => a.toLowerCase()))].sort()
        ),
        allowedDomains: Object.freeze(
          [...new Set(policy.allowedDomains.map(d => d.toLowerCase().trim()))].sort()
        )
      };

      if (policy.rateLimit) {
        frozen.rateLimit = Object.freeze({
          requests: policy.rateLimit.requests,
          windowSeconds: policy.rateLimit.windowSeconds
        });
      }

      if (policy.expiresAt) {
        frozen.expiresAt = policy.expiresAt;
      }

      return Object.freeze(frozen) as Readonly<PolicyConfig>;
    });

    // Deep freeze settings if present
    let frozenSettings = undefined;
    if (config.settings) {
      frozenSettings = Object.freeze({
        auditDir: config.settings.auditDir,
        maxFileSizeMb: config.settings.maxFileSizeMb,
        maxFileAgeDays: config.settings.maxFileAgeDays,
        defaultRateLimit: config.settings.defaultRateLimit 
          ? Object.freeze({ ...config.settings.defaultRateLimit })
          : undefined
      });
    }

    // Return fully frozen config
    return Object.freeze({
      version: config.version,
      mappings: Object.freeze(frozenMappings),
      policies: Object.freeze(frozenPolicies) as readonly PolicyConfig[],
      settings: frozenSettings
    }) as FrozenVaultConfig;
  }

  // Helper methods to extract specific parts
  getMappings(): readonly SecretMapping[] {
    return this.cachedConfig?.mappings || [];
  }

  getPolicies(): readonly PolicyConfig[] {
    return this.cachedConfig?.policies || [];
  }

  getSettings(): FrozenVaultConfig['settings'] {
    return this.cachedConfig?.settings;
  }
}