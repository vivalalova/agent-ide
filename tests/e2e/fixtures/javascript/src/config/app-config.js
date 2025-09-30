/**
 * Application configuration for E2E testing
 */

export class Config {
  constructor() {
    this.server = {
      port: 3001
    };
    this.database = {
      host: 'localhost',
      port: 5432
    };
  }

  async load() {
    // Load configuration
  }
}