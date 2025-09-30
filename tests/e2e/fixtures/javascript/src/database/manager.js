/**
 * Database manager for E2E testing
 */

export class DatabaseManager {
  constructor(config) {
    this.config = config;
    this.connected = false;
  }

  async connect() {
    this.connected = true;
  }

  async disconnect() {
    this.connected = false;
  }

  get users() {
    return {
      create: async (user) => user,
      findById: async (id) => null,
      findByEmail: async (email) => null,
      update: async (id, user) => user,
      findMany: async (options) => ({ items: [], total: 0 }),
      search: async (options) => [],
      count: async (filters) => 0
    };
  }
}