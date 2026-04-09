import type { LLMProvider, ProviderConfig, ProviderRouterConfig } from "./types.js";
import { OpenAICompatibleClient } from "./OpenAICompatibleClient.js";

// Singleton instance — initialized lazily from config file or env
let _instance: ProviderRouter | null = null;

/**
 * Known provider presets. Users can override via ~/.claude/providers.json
 */
export const PROVIDER_PRESETS: Record<string, Omit<ProviderConfig, 'apiKey'>> = {
  minimax: {
    name: 'minimax',
    providerClass: 'openai-compatible',
    modelName: 'MiniMax-M1',
    baseUrl: 'https://api.minimaxi.chat/v1',
  },
  codex: {
    name: 'codex',
    providerClass: 'openai-compatible',
    modelName: 'gpt-5.4',
    baseUrl: 'https://api.openai.com/v1',
  },
  gemini: {
    name: 'gemini',
    providerClass: 'openai-compatible',
    modelName: 'gemini-3.1-pro',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
  anthropic: {
    name: 'anthropic',
    providerClass: 'anthropic',
    modelName: 'claude-opus-4-6',
    baseUrl: 'https://api.anthropic.com',
  },
};

export function getProviderRouter(): ProviderRouter {
  if (!_instance) {
    _instance = ProviderRouter.fromEnvironment();
  }
  return _instance;
}

export function resetProviderRouter(): void {
  _instance = null;
}

export class ProviderRouter {
  private providers = new Map<string, LLMProvider>();
  readonly defaultProvider: string;
  private fallbackChain: string[];

  constructor(config: ProviderRouterConfig) {
    this.defaultProvider = config.defaultProvider;
    this.fallbackChain = config.fallbackChain ?? [config.defaultProvider];

    for (const providerConfig of config.providers) {
      const client = this.buildClient(providerConfig);
      if (client) {
        this.providers.set(providerConfig.name, client);
      }
    }
  }

  private buildClient(config: ProviderConfig): LLMProvider | null {
    switch (config.providerClass) {
      case "openai-compatible":
        return new OpenAICompatibleClient(config);
      case "anthropic":
        return {
          name: config.name,
          modelName: config.modelName,
          createMessage: async () => {
            throw new Error("Use existing Anthropic SDK path for Claude models");
          },
        };
      default:
        return null;
    }
  }

  getProvider(name: string): LLMProvider | null {
    return this.providers.get(name) ?? null;
  }

  getDefault(): LLMProvider | null {
    return this.getProvider(this.defaultProvider);
  }

  get availableProviders(): string[] {
    return [...this.providers.keys()];
  }

  getFallbackChain(): LLMProvider[] {
    return this.fallbackChain
      .map((name) => this.providers.get(name))
      .filter((p): p is LLMProvider => p !== null);
  }

  /**
   * Build a ProviderRouter from environment variables and optional config file.
   * Reads API keys from env: MINIMAX_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY
   */
  static fromEnvironment(): ProviderRouter {
    const providers: ProviderConfig[] = [];

    const keyMap: Record<string, string | undefined> = {
      minimax: process.env.MINIMAX_API_KEY,
      codex: process.env.OPENAI_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
    };

    for (const [name, preset] of Object.entries(PROVIDER_PRESETS)) {
      const apiKey = keyMap[name];
      if (apiKey || name === 'anthropic') {
        providers.push({ ...preset, apiKey: apiKey ?? '' } as ProviderConfig);
      }
    }

    // Try loading user config file for overrides
    try {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(process.env.HOME ?? '', '.claude', 'providers.json');
      if (fs.existsSync(configPath)) {
        const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (Array.isArray(userConfig.providers)) {
          for (const p of userConfig.providers) {
            // User config overrides presets
            const idx = providers.findIndex(x => x.name === p.name);
            if (idx >= 0) providers[idx] = { ...providers[idx], ...p };
            else providers.push(p);
          }
        }
      }
    } catch {
      // Config file is optional
    }

    return new ProviderRouter({
      providers,
      defaultProvider: 'anthropic',
      fallbackChain: ['anthropic'],
    });
  }
}
