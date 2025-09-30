/**
 * Order controller for E2E testing
 */

export class OrderController {
  constructor(database, userController, productController) {
    this.database = database;
    this.userController = userController;
    this.productController = productController;
  }

  async createOrder(userId, productIds) {
    return { id: '1', userId, productIds, status: 'pending' };
  }
}