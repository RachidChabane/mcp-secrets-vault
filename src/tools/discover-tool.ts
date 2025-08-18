import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SecretProvider, SecretInfo } from '../interfaces/secret-provider.interface.js';
import { TEXT } from '../constants/text-constants.js';
import { z } from 'zod';

const DiscoverSchema = z.object({});

export interface DiscoverResponse {
  readonly secrets: readonly SecretInfo[];
}

export class DiscoverTool {
  private readonly tool: Tool;

  constructor(private readonly secretProvider: SecretProvider) {
    this.tool = {
      name: TEXT.TOOL_DISCOVER,
      description: TEXT.TOOL_DISCOVER_DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    };
  }

  getTool(): Tool {
    return this.tool;
  }

  async execute(_args: unknown): Promise<DiscoverResponse> {
    DiscoverSchema.parse(_args || {});
    
    const secretIds = this.secretProvider.listSecretIds();
    const secrets: SecretInfo[] = [];
    
    for (const secretId of secretIds) {
      const info = this.secretProvider.getSecretInfo(secretId);
      if (info) {
        secrets.push(Object.freeze({
          secretId: info.secretId,
          available: info.available,
          description: info.description
        }));
      }
    }
    
    return Object.freeze({
      secrets: Object.freeze(secrets)
    });
  }
}