import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  DEBUG = 'debug',
}

const LOG_DIR = path.join(process.cwd(), 'logs');
const MAX_LOG_SIZE = 5 * 1024 * 1024;
const MAX_LOG_FILES = 5;

class Logger {
  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    let output = `${prefix} ${message}`;
    if (meta) {
      output += ` ${JSON.stringify(meta)}`;
    }

    if (level === LogLevel.ERROR) {
      console.error(output);
    } else if (level === LogLevel.WARN) {
      console.warn(output);
    } else {
      console.log(output);
    }

    this.writeToFile(output);
  }

  private writeToFile(line: string): void {
    try {
      if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
      }

      const logFile = path.join(LOG_DIR, 'gateway.log');
      this.rotateLogIfNeeded(logFile);

      fs.appendFileSync(logFile, line + '\n', 'utf-8');
    } catch {
      // Ignore file write errors to avoid crashing the app
    }
  }

  private rotateLogIfNeeded(logFile: string): void {
    try {
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size >= MAX_LOG_SIZE) {
          const oldest = path.join(LOG_DIR, 'gateway.log.5');
          if (fs.existsSync(oldest)) {
            fs.unlinkSync(oldest);
          }
          for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
            const src = path.join(LOG_DIR, `gateway.log.${i}`);
            const dst = path.join(LOG_DIR, `gateway.log.${i + 1}`);
            if (fs.existsSync(src)) {
              fs.renameSync(src, dst);
            }
          }
          fs.renameSync(logFile, path.join(LOG_DIR, 'gateway.log.1'));
        }
      }
    } catch {
      // Ignore rotation errors
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, meta);
  }
}

export const logger = new Logger();
