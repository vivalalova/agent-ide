/**
 * Product controller for E2E testing
 */

export class ProductController {
  constructor(database) {
    this.database = database;
  }

  async createProduct(data) {
    return { id: '1', ...data };
  }

  async getProduct(id) {
    return { id, name: 'Test Product' };
  }
}