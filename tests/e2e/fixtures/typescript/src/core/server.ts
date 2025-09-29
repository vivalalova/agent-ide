import express, { Express, Request, Response, NextFunction } from 'express';
import { UserService } from './user-service';
import { ProductService } from './product-service';
import { OrderService } from './order-service';
import type { AppConfig, ResponseResult } from '@types/config';
import { validateRequest } from '@utils/validation';
import { errorHandler } from '@utils/error-handler';
import { requestLogger } from '@utils/middleware';

interface ServerDependencies {
  userService: UserService;
  productService: ProductService;
  orderService: OrderService;
  config: AppConfig;
}

/**
 * Creates and configures Express server
 * Tests complex dependency injection and middleware setup
 */
export function createServer(deps: ServerDependencies): Express {
  const { userService, productService, orderService, config } = deps;
  const app = express();

  // Middleware configuration
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (config.features.enableLogging) {
    app.use(requestLogger);
  }

  // CORS configuration
  if (config.cors) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const { origin, credentials } = config.cors!;

      if (Array.isArray(origin)) {
        const requestOrigin = req.headers.origin;
        if (requestOrigin && origin.includes(requestOrigin)) {
          res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        }
      } else {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }

      if (credentials) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }

      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    const response: ResponseResult = {
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date(),
        version: '1.0.0'
      }
    };
    res.json(response);
  });

  // User routes
  app.get('/api/users', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const users = await userService.getUsers({
        page: Number(page),
        limit: Number(limit)
      });

      const response: ResponseResult = {
        success: true,
        data: users
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/users', validateRequest('user'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await userService.createUser(req.body);

      const response: ResponseResult = {
        success: true,
        data: user
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/users/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const user = await userService.getUserById(id);

      if (!user) {
        const response: ResponseResult = {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          }
        };
        return res.status(404).json(response);
      }

      const response: ResponseResult = {
        success: true,
        data: user
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  // Product routes
  app.get('/api/products', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page = 1, limit = 20, category } = req.query;
      const products = await productService.getProducts({
        page: Number(page),
        limit: Number(limit),
        category: category as string
      });

      const response: ResponseResult = {
        success: true,
        data: products
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  // Order routes with complex business logic
  app.post('/api/orders', validateRequest('order'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await orderService.createOrder(req.body);

      const response: ResponseResult = {
        success: true,
        data: order
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/orders/:id/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const status = await orderService.getOrderStatus(id);

      const response: ResponseResult = {
        success: true,
        data: { orderId: id, status }
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  // Complex route with multiple service interactions
  app.get('/api/analytics/user-orders/:userId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;

      // This demonstrates cross-service dependencies for testing
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const orders = await orderService.getUserOrders(userId, {
        startDate: startDate as string,
        endDate: endDate as string
      });

      const analytics = await orderService.calculateUserAnalytics(userId, orders);

      const response: ResponseResult = {
        success: true,
        data: {
          user: { id: user.id, name: user.name },
          analytics,
          period: { startDate, endDate }
        }
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  // Error handling middleware
  app.use(errorHandler);

  // 404 handler
  app.use((req: Request, res: Response) => {
    const response: ResponseResult = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found`
      }
    };
    res.status(404).json(response);
  });

  return app;
}