/**
 * Main Entry Point
 */

import { UserService } from './services/user-service';
import { AuthService } from './services/auth-service';
import { ProductService } from './services/product-service';
import { OrderService } from './services/order-service';
import { NotificationService } from './services/notification-service';
import { PaymentService } from './services/payment-service';

import { UserController } from './controllers/user-controller';
import { ProductController } from './controllers/product-controller';
import { OrderController } from './controllers/order-controller';

import { UserHandler } from './api/handlers/user-handler';
import { ProductHandler } from './api/handlers/product-handler';
import { AuthMiddleware } from './api/middleware/auth';
import { ValidatorMiddleware } from './api/middleware/validator';

import { getConfig } from './core/config/settings';
import { APP_NAME, VERSION } from './core/constants';

// 初始化服務
const userService = new UserService();
const authService = new AuthService(userService);
const productService = new ProductService();
const orderService = new OrderService(userService, productService);
const notificationService = new NotificationService();
const paymentService = new PaymentService();

// 初始化控制器
const userController = new UserController(userService);
const productController = new ProductController(productService);
const orderController = new OrderController(orderService);

// 初始化 API 層
const userHandler = new UserHandler(userService);
const productHandler = new ProductHandler(productService);
const authMiddleware = new AuthMiddleware(authService);
const validatorMiddleware = new ValidatorMiddleware();

// 取得配置
const config = getConfig();

console.log(`${APP_NAME} v${VERSION} initialized`);
console.log(`Environment: ${config.environment}`);
console.log(`Server: ${config.server.host}:${config.server.port}`);

// 匯出所有服務和控制器供測試使用
export {
  // Services
  userService,
  authService,
  productService,
  orderService,
  notificationService,
  paymentService,
  // Controllers
  userController,
  productController,
  orderController,
  // API
  userHandler,
  productHandler,
  authMiddleware,
  validatorMiddleware,
  // Config
  config
};
