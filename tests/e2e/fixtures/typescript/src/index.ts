import { createServer } from './core/server';
import { DatabaseConnection } from '@core/database';
import { UserService } from '@core/user-service';
import { ProductService } from '@core/product-service';
import { OrderService } from '@core/order-service';
import { calculateMetrics } from '@utils/metrics';
import { logger } from '@utils/logger';
import type { AppConfig } from '@types/config';

/**
 * Main application entry point
 * Demonstrates complex TypeScript patterns for E2E testing
 */
async function main(): Promise<void> {
  const config: AppConfig = {
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
      name: process.env.DB_NAME || 'testdb'
    },
    features: {
      enableMetrics: true,
      enableLogging: true,
      enableCache: false
    }
  };

  try {
    logger.info('Starting application...');

    // Initialize database connection
    const database = new DatabaseConnection(config.database);
    await database.connect();

    // Initialize services with dependency injection
    const userService = new UserService(database);
    const productService = new ProductService(database);
    const orderService = new OrderService(database, userService, productService);

    // Create Express server
    const app = createServer({
      userService,
      productService,
      orderService,
      config
    });

    // Start server
    const server = app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
    });

    // Calculate and log startup metrics
    if (config.features.enableMetrics) {
      const metrics = await calculateMetrics();
      logger.info('Startup metrics:', metrics);
    }

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      server.close(() => {
        database.disconnect();
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Export for testing
export { main };

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}