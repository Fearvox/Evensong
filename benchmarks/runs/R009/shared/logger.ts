// R009 Evensong III — Structured Logger with Correlation IDs
import { randomUUID } from 'crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  correlationId: string;
  message: string;
  data?: Record<string, unknown>;
}

export class Logger {
  private minLevel: number;

  constructor(
    private service: string,
    private correlationId: string = randomUUID(),
    level: LogLevel = 'info'
  ) {
    this.minLevel = LEVELS[level];
  }

  child(extra: { correlationId?: string; service?: string }): Logger {
    return new Logger(extra.service || this.service, extra.correlationId || this.correlationId);
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): LogEntry | null {
    if (LEVELS[level] < this.minLevel) return null;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      correlationId: this.correlationId,
      message,
      data,
    };
    return entry;
  }

  debug(msg: string, data?: Record<string, unknown>) { return this.log('debug', msg, data); }
  info(msg: string, data?: Record<string, unknown>) { return this.log('info', msg, data); }
  warn(msg: string, data?: Record<string, unknown>) { return this.log('warn', msg, data); }
  error(msg: string, data?: Record<string, unknown>) { return this.log('error', msg, data); }
}

export function createLogger(service: string, correlationId?: string): Logger {
  return new Logger(service, correlationId);
}
