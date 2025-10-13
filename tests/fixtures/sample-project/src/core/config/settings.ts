/**
 * Application Settings
 */

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface ServerConfig {
  host: string;
  port: number;
  timeout: number;
}

export interface AppConfig {
  name: string;
  version: string;
  environment: 'development' | 'production' | 'test';
  server: ServerConfig;
  database: DatabaseConfig;
  features: {
    enableCache: boolean;
    enableLogging: boolean;
    enableMetrics: boolean;
  };
}

export const defaultConfig: AppConfig = {
  name: 'Sample Project',
  version: '1.0.0',
  environment: 'development',
  server: {
    host: 'localhost',
    port: 3000,
    timeout: 30000
  },
  database: {
    host: 'localhost',
    port: 5432,
    database: 'sample_db',
    username: 'admin',
    password: 'password'
  },
  features: {
    enableCache: true,
    enableLogging: true,
    enableMetrics: false
  }
};

export function getConfig(): AppConfig {
  return { ...defaultConfig };
}
