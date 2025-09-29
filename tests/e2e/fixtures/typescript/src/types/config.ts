/**
 * Application configuration types
 * Testing complex type definitions and interfaces
 */

export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  maxConnections?: number;
}

export interface FeatureFlags {
  enableMetrics: boolean;
  enableLogging: boolean;
  enableCache: boolean;
  enableAuth?: boolean;
  enableRateLimit?: boolean;
}

export interface AppConfig {
  port: number;
  database: DatabaseConfig;
  features: FeatureFlags;
  environment?: 'development' | 'production' | 'test';
  cors?: {
    origin: string | string[];
    credentials: boolean;
  };
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerConfig {
  level: LogLevel;
  format: 'json' | 'text';
  destination: 'console' | 'file' | 'both';
  filename?: string;
}

// Complex generic types for testing
export type ResponseResult<T = any> = {
  success: true;
  data: T;
  metadata?: {
    timestamp: Date;
    requestId: string;
  };
} | {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    timestamp: Date;
    requestId: string;
  };
};

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Utility types for complex scenarios
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;