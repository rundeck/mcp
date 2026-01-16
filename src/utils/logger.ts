/**
 * Logger utility for MCP server
 * Provides structured logging with different log levels
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel;
  private isDebug: boolean;

  constructor() {
    // Check MCP_DEBUG environment variable
    this.isDebug = process.env.MCP_DEBUG === "1" || process.env.MCP_DEBUG === "true";
    this.level = this.isDebug ? LogLevel.DEBUG : LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const prefix = `[MCP ${level}] ${timestamp}`;
    
    if (args.length === 0) {
      return `${prefix} ${message}`;
    }

    // Format arguments
    const formattedArgs = args.map((arg) => {
      if (typeof arg === "object") {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    });

    return `${prefix} ${message}\n${formattedArgs.join("\n")}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.error(this.formatMessage("DEBUG", message, ...args));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.error(this.formatMessage("INFO", message, ...args));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.error(this.formatMessage("WARN", message, ...args));
    }
  }

  error(message: string, error?: Error | unknown, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      let errorDetails = "";
      
      if (error instanceof Error) {
        errorDetails = `\nError: ${error.message}`;
        if (this.isDebug && error.stack) {
          errorDetails += `\nStack: ${error.stack}`;
        }
      } else if (error) {
        errorDetails = `\nError: ${String(error)}`;
      }

      console.error(this.formatMessage("ERROR", message, ...args) + errorDetails);
    }
  }

  // Convenience methods for MCP protocol logging
  logRequest(method: string, params?: unknown): void {
    this.debug(`Request: ${method}`, params);
  }

  logResponse(method: string, result?: unknown): void {
    this.debug(`Response: ${method}`, result);
  }

  logToolCall(name: string, args?: unknown): void {
    this.info(`Tool called: ${name}`, args);
  }

  logResourceAccess(uri: string): void {
    this.debug(`Resource accessed: ${uri}`);
  }
}

export const logger = new Logger();



