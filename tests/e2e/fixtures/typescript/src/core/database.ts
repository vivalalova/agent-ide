import type { DatabaseConfig } from '@types/config';
import { logger } from '@utils/logger';

/**
 * Mock database connection for testing complex data access patterns
 */
export class DatabaseConnection {
  private config: DatabaseConfig;
  private connected = false;
  private readonly users = new UserRepository();
  private readonly products = new ProductRepository();
  private readonly orders = new OrderRepository();

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    logger.info('Connecting to database...', {
      host: this.config.host,
      port: this.config.port,
      database: this.config.name
    });

    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 100));

    this.connected = true;
    logger.info('Database connected successfully');
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      logger.info('Disconnecting from database...');
      this.connected = false;
      logger.info('Database disconnected');
    }
  }

  get users(): UserRepository {
    this.ensureConnected();
    return this.users;
  }

  get products(): ProductRepository {
    this.ensureConnected();
    return this.products;
  }

  get orders(): OrderRepository {
    this.ensureConnected();
    return this.orders;
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Database not connected');
    }
  }
}

// Base repository with common CRUD operations
abstract class BaseRepository<T extends { id: string }> {
  protected items = new Map<string, T>();

  async save(item: T): Promise<T> {
    this.items.set(item.id, { ...item });
    return item;
  }

  async findById(id: string): Promise<T | null> {
    return this.items.get(id) || null;
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    const existing = this.items.get(id);
    if (!existing) {
      throw new Error(`Item with id ${id} not found`);
    }

    const updated = { ...existing, ...updates };
    this.items.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    if (!this.items.has(id)) {
      throw new Error(`Item with id ${id} not found`);
    }
    this.items.delete(id);
  }

  async findAll(): Promise<T[]> {
    return Array.from(this.items.values());
  }

  async count(filters?: Record<string, any>): Promise<number> {
    let items = Array.from(this.items.values());

    if (filters) {
      items = items.filter(item => {
        return Object.entries(filters).every(([key, value]) => {
          return (item as any)[key] === value;
        });
      });
    }

    return items.length;
  }
}

// User repository with specific query methods
class UserRepository extends BaseRepository<any> {
  async findByEmail(email: string): Promise<any | null> {
    for (const user of this.items.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  async findMany(options: {
    filters?: Record<string, any>;
    pagination: { page: number; limit: number };
    sort: Record<string, 'asc' | 'desc'>;
  }): Promise<{
    items: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    let items = Array.from(this.items.values());

    // Apply filters
    if (options.filters) {
      items = items.filter(item => {
        return Object.entries(options.filters!).every(([key, value]) => {
          return (item as any)[key] === value;
        });
      });
    }

    // Apply sorting
    const [sortKey, sortOrder] = Object.entries(options.sort)[0];
    items.sort((a, b) => {
      const aVal = (a as any)[sortKey];
      const bVal = (b as any)[sortKey];

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const total = items.length;
    const totalPages = Math.ceil(total / options.pagination.limit);
    const startIndex = (options.pagination.page - 1) * options.pagination.limit;
    const endIndex = startIndex + options.pagination.limit;

    const paginatedItems = items.slice(startIndex, endIndex);

    return {
      items: paginatedItems,
      pagination: {
        page: options.pagination.page,
        limit: options.pagination.limit,
        total,
        totalPages,
        hasNext: options.pagination.page < totalPages,
        hasPrev: options.pagination.page > 1
      }
    };
  }

  async search(options: {
    query: string;
    fields: string[];
    filters?: Record<string, any>;
  }): Promise<any[]> {
    let items = Array.from(this.items.values());

    // Apply filters first
    if (options.filters) {
      items = items.filter(item => {
        return Object.entries(options.filters!).every(([key, value]) => {
          return (item as any)[key] === value;
        });
      });
    }

    // Apply search
    const query = options.query.toLowerCase();
    items = items.filter(item => {
      return options.fields.some(field => {
        const value = this.getNestedValue(item, field);
        return value && value.toString().toLowerCase().includes(query);
      });
    });

    return items;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}

// Product repository
class ProductRepository extends BaseRepository<any> {
  async findByCategory(category: string, pagination?: {
    page: number;
    limit: number;
  }): Promise<any[]> {
    let items = Array.from(this.items.values())
      .filter(product => product.category === category);

    if (pagination) {
      const startIndex = (pagination.page - 1) * pagination.limit;
      const endIndex = startIndex + pagination.limit;
      items = items.slice(startIndex, endIndex);
    }

    return items;
  }

  async findInPriceRange(minPrice: number, maxPrice: number): Promise<any[]> {
    return Array.from(this.items.values())
      .filter(product => product.price >= minPrice && product.price <= maxPrice);
  }

  async search(query: string): Promise<any[]> {
    const searchTerm = query.toLowerCase();
    return Array.from(this.items.values())
      .filter(product =>
        product.name.toLowerCase().includes(searchTerm) ||
        product.description.toLowerCase().includes(searchTerm) ||
        product.category.toLowerCase().includes(searchTerm)
      );
  }
}

// Order repository with complex queries
class OrderRepository extends BaseRepository<any> {
  async findByUserId(userId: string): Promise<any[]> {
    return Array.from(this.items.values())
      .filter(order => order.userId === userId);
  }

  async findByStatus(status: string): Promise<any[]> {
    return Array.from(this.items.values())
      .filter(order => order.status === status);
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<any[]> {
    return Array.from(this.items.values())
      .filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= startDate && orderDate <= endDate;
      });
  }

  async getUserOrdersInDateRange(userId: string, startDate: Date, endDate: Date): Promise<any[]> {
    return Array.from(this.items.values())
      .filter(order => {
        const orderDate = new Date(order.createdAt);
        return order.userId === userId &&
               orderDate >= startDate &&
               orderDate <= endDate;
      });
  }

  async getOrdersByProductId(productId: string): Promise<any[]> {
    return Array.from(this.items.values())
      .filter(order => {
        return order.items.some((item: any) => item.productId === productId);
      });
  }

  async getTotalSales(startDate?: Date, endDate?: Date): Promise<{
    totalAmount: number;
    totalOrders: number;
    averageOrderValue: number;
  }> {
    let orders = Array.from(this.items.values());

    if (startDate && endDate) {
      orders = orders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= startDate && orderDate <= endDate;
      });
    }

    const totalAmount = orders.reduce((sum, order) => sum + order.total, 0);
    const totalOrders = orders.length;
    const averageOrderValue = totalOrders > 0 ? totalAmount / totalOrders : 0;

    return {
      totalAmount,
      totalOrders,
      averageOrderValue
    };
  }
}