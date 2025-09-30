import { createServer } from './server.js';
import { DatabaseManager } from './database/manager.js';
import { UserController } from './controllers/user-controller.js';
import { ProductController } from './controllers/product-controller.js';
import { OrderController } from './controllers/order-controller.js';
import { Logger } from './utils/logger.js';
import { Config } from './config/app-config.js';

/**
 * JavaScript E2E test project
 * Demonstrates modern JavaScript patterns and ES modules
 */

const logger = new Logger('app');

async function startApplication() {
  try {
    logger.info('Starting JavaScript application...');

    // Initialize configuration
    const config = new Config();
    await config.load();

    // Initialize database
    const database = new DatabaseManager(config.database);
    await database.connect();

    // Initialize controllers
    const userController = new UserController(database);
    const productController = new ProductController(database);
    const orderController = new OrderController(database, userController, productController);

    // Create and configure server
    const app = createServer({
      controllers: {
        user: userController,
        product: productController,
        order: orderController
      },
      config,
      database
    });

    // Start server
    const port = config.server.port || 3001;
    const server = app.listen(port, () => {
      logger.info(`Server running on port ${port}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');

      server.close(async () => {
        await database.disconnect();
        logger.info('Application shutdown complete');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');

      server.close(async () => {
        await database.disconnect();
        logger.info('Application shutdown complete');
        process.exit(0);
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

    logger.info('Application started successfully');

  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Export for testing
export { startApplication };

// Start if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  startApplication();
}