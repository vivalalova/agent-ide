import { DatabaseConnection } from './database';
import type { PaginationParams, PaginatedResponse } from '@types/config';
import { generateId, hashPassword } from '@utils/crypto';
import { logger } from '@utils/logger';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  profile: UserProfile;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest'
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  avatar?: string;
  bio?: string;
  location?: {
    country: string;
    city: string;
    timezone: string;
  };
  social?: {
    twitter?: string;
    github?: string;
    linkedin?: string;
  };
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  notifications: {
    email: boolean;
    push: boolean;
    marketing: boolean;
  };
  privacy: {
    showProfile: boolean;
    showActivity: boolean;
    allowFollowers: boolean;
  };
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
  profile: Omit<UserProfile, 'avatar'>;
  preferences?: Partial<UserPreferences>;
}

/**
 * User service with complex business logic
 * Tests service layer patterns and dependency injection
 */
export class UserService {
  private readonly database: DatabaseConnection;
  private readonly cache = new Map<string, User>();

  constructor(database: DatabaseConnection) {
    this.database = database;
  }

  async createUser(input: CreateUserInput): Promise<User> {
    logger.debug('Creating user:', { email: input.email, role: input.role });

    // Business logic validation
    const existingUser = await this.getUserByEmail(input.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Generate secure ID and hash password
    const id = generateId();
    const hashedPassword = await hashPassword(input.password);

    // Default preferences
    const defaultPreferences: UserPreferences = {
      theme: 'auto',
      language: 'en',
      notifications: {
        email: true,
        push: true,
        marketing: false
      },
      privacy: {
        showProfile: true,
        showActivity: false,
        allowFollowers: true
      }
    };

    const user: User = {
      id,
      name: input.name,
      email: input.email.toLowerCase(),
      password: hashedPassword,
      role: input.role || UserRole.USER,
      profile: {
        ...input.profile,
        avatar: this.generateDefaultAvatar(input.name)
      },
      preferences: {
        ...defaultPreferences,
        ...input.preferences
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Simulate database save
    await this.database.users.save(user);

    // Cache the user
    this.cache.set(id, user);

    logger.info('User created successfully:', { id, email: user.email });
    return this.sanitizeUser(user);
  }

  async getUserById(id: string): Promise<User | null> {
    // Check cache first
    const cached = this.cache.get(id);
    if (cached) {
      return this.sanitizeUser(cached);
    }

    // Fetch from database
    const user = await this.database.users.findById(id);
    if (user) {
      this.cache.set(id, user);
      return this.sanitizeUser(user);
    }

    return null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase();

    // Check cache (simple linear search for demo)
    for (const [, user] of this.cache) {
      if (user.email === normalizedEmail) {
        return this.sanitizeUser(user);
      }
    }

    // Fetch from database
    const user = await this.database.users.findByEmail(normalizedEmail);
    if (user) {
      this.cache.set(user.id, user);
      return this.sanitizeUser(user);
    }

    return null;
  }

  async getUsers(params: PaginationParams & { role?: UserRole }): Promise<PaginatedResponse<User>> {
    const { page, limit, sortBy = 'createdAt', sortOrder = 'desc', role } = params;

    logger.debug('Fetching users:', { page, limit, sortBy, sortOrder, role });

    // Simulate database query with filtering
    const filters = role ? { role } : {};
    const result = await this.database.users.findMany({
      filters,
      pagination: { page, limit },
      sort: { [sortBy]: sortOrder }
    });

    const sanitizedUsers = result.items.map(user => this.sanitizeUser(user));

    return {
      items: sanitizedUsers,
      pagination: result.pagination
    };
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const user = await this.getUserById(id);
    if (!user) {
      throw new Error('User not found');
    }

    // Business logic for updates
    if (updates.email && updates.email !== user.email) {
      const existingUser = await this.getUserByEmail(updates.email);
      if (existingUser && existingUser.id !== id) {
        throw new Error('Email already in use');
      }
    }

    const updatedUser: User = {
      ...user,
      ...updates,
      password: user.password, // Don't allow password updates through this method
      updatedAt: new Date()
    };

    await this.database.users.update(id, updatedUser);
    this.cache.set(id, updatedUser);

    logger.info('User updated:', { id, fields: Object.keys(updates) });
    return this.sanitizeUser(updatedUser);
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.getUserById(id);
    if (!user) {
      throw new Error('User not found');
    }

    // Business logic checks
    if (user.role === UserRole.ADMIN) {
      const adminCount = await this.countUsersByRole(UserRole.ADMIN);
      if (adminCount <= 1) {
        throw new Error('Cannot delete the last admin user');
      }
    }

    await this.database.users.delete(id);
    this.cache.delete(id);

    logger.info('User deleted:', { id, email: user.email });
  }

  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.database.users.findById(id);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password (simplified for demo)
    const isValidPassword = await this.verifyPassword(currentPassword, user.password);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    const hashedPassword = await hashPassword(newPassword);
    await this.database.users.update(id, {
      password: hashedPassword,
      updatedAt: new Date()
    });

    logger.info('Password changed for user:', { id });
  }

  async searchUsers(query: string, filters?: {
    role?: UserRole;
    location?: string;
  }): Promise<User[]> {
    const result = await this.database.users.search({
      query,
      fields: ['name', 'email', 'profile.firstName', 'profile.lastName'],
      filters
    });

    return result.map(user => this.sanitizeUser(user));
  }

  // Complex business logic methods
  async getUserAnalytics(id: string): Promise<{
    loginCount: number;
    lastLoginAt: Date | null;
    activityScore: number;
    preferredFeatures: string[];
  }> {
    // This would integrate with analytics service
    const user = await this.getUserById(id);
    if (!user) {
      throw new Error('User not found');
    }

    // Simulate complex analytics calculation
    return {
      loginCount: Math.floor(Math.random() * 100),
      lastLoginAt: new Date(),
      activityScore: Math.random() * 100,
      preferredFeatures: ['dashboard', 'reports', 'settings']
    };
  }

  private sanitizeUser(user: User): User {
    // Remove sensitive data before returning
    const { password, ...sanitized } = user;
    return sanitized as User;
  }

  private generateDefaultAvatar(name: string): string {
    const initials = name.split(' ').map(part => part[0]).join('').toUpperCase();
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&size=200`;
  }

  private async verifyPassword(plaintext: string, hashed: string): Promise<boolean> {
    // Simplified password verification for demo
    return plaintext.length > 0 && hashed.length > 0;
  }

  private async countUsersByRole(role: UserRole): Promise<number> {
    const result = await this.database.users.count({ role });
    return result;
  }
}