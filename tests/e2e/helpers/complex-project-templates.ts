/**
 * 複雜測試專案樣板產生器
 * 建立大量跨檔案引用的測試場景
 */

/**
 * 建立被多個檔案引用的型別定義（for rename 測試）
 *
 * 結構：
 * - src/types/user.ts: 定義 User 介面
 * - src/services/*.ts: 10 個服務檔案引用 User
 *
 * @param typeName 型別名稱（預設 'User'）
 * @param referenceCount 引用檔案數量（預設 10）
 */
export function createTypeWithManyReferences(
  typeName: string = 'User',
  referenceCount: number = 10
): Record<string, string> {
  const files: Record<string, string> = {};

  // 定義型別的檔案
  files['src/types/user.ts'] = `
export interface ${typeName} {
  id: string;
  name: string;
  email: string;
}

export type ${typeName}ID = string;
`.trim();

  // 建立多個引用此型別的服務檔案
  const serviceNames = [
    'user-service',
    'auth-service',
    'profile-service',
    'account-service',
    'settings-service',
    'notification-service',
    'permission-service',
    'session-service',
    'activity-service',
    'analytics-service',
    'admin-service',
    'report-service',
    'export-service',
    'import-service',
    'validation-service'
  ];

  for (let i = 0; i < Math.min(referenceCount, serviceNames.length); i++) {
    const serviceName = serviceNames[i];
    files[`src/services/${serviceName}.ts`] = `
import { ${typeName} } from '../types/user';

export class ${toPascalCase(serviceName)} {
  private users: ${typeName}[] = [];

  getUser(id: string): ${typeName} | undefined {
    return this.users.find(u => u.id === id);
  }

  addUser(user: ${typeName}): void {
    this.users.push(user);
  }

  updateUser(user: ${typeName}): void {
    const index = this.users.findIndex(u => u.id === user.id);
    if (index !== -1) {
      this.users[index] = user;
    }
  }
}
`.trim();
  }

  return files;
}

/**
 * 建立被多個檔案引用的共用模組（for move 測試）
 *
 * 結構：
 * - src/utils/helper.ts: 共用工具函式
 * - src/services/*.ts, src/api/*.ts, src/controllers/*.ts: 引用 helper.ts
 *
 * @param moduleName 模組名稱（預設 'helper'）
 * @param referenceCount 引用檔案數量（預設 10）
 */
export function createModuleWithManyImports(
  moduleName: string = 'helper',
  referenceCount: number = 10
): Record<string, string> {
  const files: Record<string, string> = {};

  // 定義被引用的模組（包含多個 types 和 functions）
  files[`src/utils/${moduleName}.ts`] = `
// Types and Interfaces
export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Product {
  id: string;
  title: string;
  price: number;
  stock: number;
}

export type UserID = string;
export type ProductID = string;

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  timestamp: number;
}

export type ValidationResult = {
  isValid: boolean;
  errors: string[];
};

// Functions
export function formatDate(date: Date): string {
  return date.toISOString();
}

export function validateEmail(email: string): boolean {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}

export function generateId(): string {
  return Math.random().toString(36).substring(7);
}

export const CONSTANTS = {
  MAX_LENGTH: 100,
  MIN_LENGTH: 1
};
`.trim();

  // 在不同目錄層級建立引用檔案
  const locations = [
    { dir: 'services', importPath: `../utils/${moduleName}`, count: 4 },
    { dir: 'api', importPath: `../utils/${moduleName}`, count: 3 },
    { dir: 'controllers', importPath: `../utils/${moduleName}`, count: 3 },
    { dir: 'models', importPath: `../utils/${moduleName}`, count: 3 },
    { dir: 'core/services', importPath: `../../utils/${moduleName}`, count: 2 }
  ];

  // 不同檔案使用不同的 type 組合
  const importCombinations = [
    // 組合 1: User 相關
    {
      imports: 'User, UserID, ApiResponse, formatDate, generateId',
      usage: `
export function createUser(name: string, email: string): User {
  const id: UserID = generateId();
  return { id, name, email };
}

export function getUserResponse(user: User): ApiResponse<User> {
  return {
    success: true,
    data: user,
    timestamp: Date.now()
  };
}`
    },
    // 組合 2: Product 相關
    {
      imports: 'Product, ProductID, ApiResponse, generateId, CONSTANTS',
      usage: `
export function createProduct(title: string, price: number): Product {
  const id: ProductID = generateId();
  return { id, title, price, stock: CONSTANTS.MAX_LENGTH };
}

export function getProductResponse(product: Product): ApiResponse<Product> {
  return {
    success: true,
    data: product,
    timestamp: Date.now()
  };
}`
    },
    // 組合 3: Validation 相關
    {
      imports: 'ValidationResult, User, validateEmail, formatDate',
      usage: `
export function validateUser(user: User): ValidationResult {
  const errors: string[] = [];
  if (!validateEmail(user.email)) {
    errors.push('Invalid email');
  }
  return { isValid: errors.length === 0, errors };
}

export function formatUserDate(user: User): string {
  return formatDate(new Date());
}`
    },
    // 組合 4: 混合使用
    {
      imports: 'User, Product, ApiResponse, ValidationResult, validateEmail, generateId',
      usage: `
export type UserOrProduct = User | Product;

export function processEntity(entity: UserOrProduct): ApiResponse<UserOrProduct> {
  const id = generateId();
  return {
    success: true,
    data: entity,
    timestamp: Date.now()
  };
}

export function validate(email: string): ValidationResult {
  return {
    isValid: validateEmail(email),
    errors: []
  };
}`
    }
  ];

  let fileIndex = 0;
  for (const location of locations) {
    for (let i = 0; i < location.count && fileIndex < referenceCount; i++) {
      const fileName = `file${fileIndex + 1}.ts`;
      const combo = importCombinations[fileIndex % importCombinations.length];

      files[`src/${location.dir}/${fileName}`] = `
import { ${combo.imports} } from '${location.importPath}';
${combo.usage}
`.trim();
      fileIndex++;
    }

    if (fileIndex >= referenceCount) {
      break;
    }
  }

  return files;
}

/**
 * 建立跨層級引用的複雜專案（for rename 測試）
 *
 * 結構：多層目錄，每層都引用核心型別
 * - src/types/core.ts: 定義 ApiResponse
 * - src/api/, src/services/, src/controllers/: 各層級引用
 */
export function createMultiLayerReferenceProject(
  typeName: string = 'ApiResponse'
): Record<string, string> {
  const files: Record<string, string> = {};

  // 核心型別定義
  files['src/types/core.ts'] = `
export interface ${typeName}<T = unknown> {
  success: boolean;
  data: T;
  error?: string;
  timestamp: number;
}

export type ${typeName}Success<T> = ${typeName}<T> & { success: true };
export type ${typeName}Error = ${typeName}<never> & { success: false; error: string };
`.trim();

  // 第一層：API 層
  files['src/api/user-api.ts'] = `
import { ${typeName} } from '../types/core';

export async function fetchUser(id: string): Promise<${typeName}> {
  return { success: true, data: { id }, timestamp: Date.now() };
}
`.trim();

  files['src/api/product-api.ts'] = `
import { ${typeName} } from '../types/core';

export async function fetchProduct(id: string): Promise<${typeName}> {
  return { success: true, data: { id }, timestamp: Date.now() };
}
`.trim();

  // 第二層：Service 層
  files['src/services/user-service.ts'] = `
import { ${typeName} } from '../types/core';
import { fetchUser } from '../api/user-api';

export class UserService {
  async getUser(id: string): Promise<${typeName}> {
    return fetchUser(id);
  }
}
`.trim();

  files['src/services/product-service.ts'] = `
import { ${typeName} } from '../types/core';
import { fetchProduct } from '../api/product-api';

export class ProductService {
  async getProduct(id: string): Promise<${typeName}> {
    return fetchProduct(id);
  }
}
`.trim();

  // 第三層：Controller 層
  files['src/controllers/user-controller.ts'] = `
import { ${typeName} } from '../types/core';
import { UserService } from '../services/user-service';

export class UserController {
  constructor(private userService: UserService) {}

  async handleGetUser(id: string): Promise<${typeName}> {
    return this.userService.getUser(id);
  }
}
`.trim();

  files['src/controllers/product-controller.ts'] = `
import { ${typeName} } from '../types/core';
import { ProductService } from '../services/product-service';

export class ProductController {
  constructor(private productService: ProductService) {}

  async handleGetProduct(id: string): Promise<${typeName}> {
    return this.productService.getProduct(id);
  }
}
`.trim();

  // 第四層：Main 入口
  files['src/index.ts'] = `
import { ${typeName} } from './types/core';
import { UserController } from './controllers/user-controller';
import { UserService } from './services/user-service';

const userService = new UserService();
const userController = new UserController(userService);

async function main(): Promise<${typeName}> {
  return userController.handleGetUser('123');
}

main();
`.trim();

  return files;
}

/**
 * 建立跨目錄的檔案移動測試場景（for move 測試）
 *
 * 結構：
 * - src/core/utils/formatter.ts: 被多層級檔案引用
 * - 各層級檔案使用不同的相對路徑引用
 */
export function createCrossDirectoryImportProject(
  moduleName: string = 'formatter'
): Record<string, string> {
  const files: Record<string, string> = {};

  // 深層工具模組
  files[`src/core/utils/${moduleName}.ts`] = `
export function format(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function parse(text: string): unknown {
  return JSON.parse(text);
}
`.trim();

  // 同層級引用（相對路徑短）
  files['src/core/utils/validator.ts'] = `
import { format } from './${moduleName}';

export function validate(data: unknown): boolean {
  console.log(format(data));
  return true;
}
`.trim();

  // 上一層引用
  files['src/core/services/data-service.ts'] = `
import { format, parse } from '../utils/${moduleName}';

export class DataService {
  serialize(data: unknown): string {
    return format(data);
  }

  deserialize(text: string): unknown {
    return parse(text);
  }
}
`.trim();

  // 上兩層引用
  files['src/api/handlers/data-handler.ts'] = `
import { format } from '../../core/utils/${moduleName}';

export function handleData(data: unknown): string {
  return format(data);
}
`.trim();

  // 上三層引用
  files['src/index.ts'] = `
import { format } from './core/utils/${moduleName}';

console.log(format({ message: 'Hello' }));
`.trim();

  // 平行目錄引用（跨目錄樹）
  files['src/controllers/response-controller.ts'] = `
import { format } from '../core/utils/${moduleName}';

export class ResponseController {
  formatResponse(data: unknown): string {
    return format(data);
  }
}
`.trim();

  files['src/models/data-model.ts'] = `
import { format, parse } from '../core/utils/${moduleName}';

export class DataModel {
  toString(data: unknown): string {
    return format(data);
  }

  fromString(text: string): unknown {
    return parse(text);
  }
}
`.trim();

  return files;
}

/**
 * 建立包含整個目錄移動的測試場景（for move 測試）
 *
 * 結構：
 * - src/utils/ 目錄包含多個檔案
 * - 每個檔案都被其他檔案引用
 */
export function createDirectoryMoveProject(): Record<string, string> {
  const files: Record<string, string> = {};

  // utils 目錄中的多個檔案
  files['src/utils/string-utils.ts'] = `
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
`.trim();

  files['src/utils/number-utils.ts'] = `
export function round(num: number, decimals: number = 2): number {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}
`.trim();

  files['src/utils/array-utils.ts'] = `
export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
`.trim();

  // 引用 utils 目錄中檔案的服務
  files['src/services/text-service.ts'] = `
import { capitalize } from '../utils/string-utils';

export class TextService {
  format(text: string): string {
    return capitalize(text);
  }
}
`.trim();

  files['src/services/math-service.ts'] = `
import { round } from '../utils/number-utils';

export class MathService {
  calculate(value: number): number {
    return round(value);
  }
}
`.trim();

  files['src/services/collection-service.ts'] = `
import { unique } from '../utils/array-utils';

export class CollectionService {
  deduplicate<T>(items: T[]): T[] {
    return unique(items);
  }
}
`.trim();

  // API 層引用
  files['src/api/text-api.ts'] = `
import { capitalize } from '../utils/string-utils';

export function processText(text: string): string {
  return capitalize(text);
}
`.trim();

  files['src/api/math-api.ts'] = `
import { round } from '../utils/number-utils';

export function processNumber(num: number): number {
  return round(num);
}
`.trim();

  return files;
}

/**
 * 工具函式：轉換為 PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}
