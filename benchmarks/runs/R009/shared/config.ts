// R009 Evensong III — Centralized Configuration
export interface ServiceConfig {
  name: string;
  port: number;
  host: string;
  env: 'development' | 'staging' | 'production';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  db: { host: string; port: number; name: string; poolSize: number };
  redis: { host: string; port: number };
  rabbitmq: { host: string; port: number; vhost: string };
}

const defaults: ServiceConfig = {
  name: 'unknown',
  port: 3000,
  host: '0.0.0.0',
  env: (process.env.NODE_ENV as ServiceConfig['env']) || 'development',
  logLevel: (process.env.LOG_LEVEL as ServiceConfig['logLevel']) || 'info',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME || 'r009',
    poolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  rabbitmq: {
    host: process.env.RABBITMQ_HOST || 'localhost',
    port: parseInt(process.env.RABBITMQ_PORT || '5672'),
    vhost: process.env.RABBITMQ_VHOST || '/',
  },
};

export function createConfig(overrides: Partial<ServiceConfig>): ServiceConfig {
  return { ...defaults, ...overrides, db: { ...defaults.db, ...overrides.db }, redis: { ...defaults.redis, ...overrides.redis }, rabbitmq: { ...defaults.rabbitmq, ...overrides.rabbitmq } };
}

export function validateConfig(config: ServiceConfig): string[] {
  const errors: string[] = [];
  if (!config.name || config.name === 'unknown') errors.push('Service name is required');
  if (config.port < 1 || config.port > 65535) errors.push(`Invalid port: ${config.port}`);
  if (config.db.poolSize < 1 || config.db.poolSize > 100) errors.push(`Invalid pool size: ${config.db.poolSize}`);
  if (!['development', 'staging', 'production'].includes(config.env)) errors.push(`Invalid env: ${config.env}`);
  return errors;
}
