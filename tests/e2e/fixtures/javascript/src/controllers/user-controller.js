import { Logger } from '../utils/logger.js';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors.js';

// Simple UUID replacement for testing
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Simple bcrypt replacement for testing
const bcrypt = {
  async hash(password, saltRounds) {
    return `hashed_${password}_${saltRounds}`;
  },
  async compare(password, hash) {
    return hash === `hashed_${password}_10`;
  }
};

/**
 * User controller with comprehensive business logic
 * Tests JavaScript class patterns and async/await
 */
export class UserController {
  constructor(database) {
    this.database = database;
    this.logger = new Logger('UserController');
    this.users = new Map();
    this.saltRounds = 10;
  }

  async createUser(userData) {
    this.logger.debug('Creating user', { email: userData.email });

    // Validation
    this.validateUserData(userData);

    // Check for existing user
    const existingUser = await this.findUserByEmail(userData.email);
    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(userData.password, this.saltRounds);

    // Create user object
    const user = {
      id: uuidv4(),
      email: userData.email.toLowerCase(),
      name: userData.name,
      password: hashedPassword,
      role: userData.role || 'user',
      profile: {
        firstName: userData.profile?.firstName || '',
        lastName: userData.profile?.lastName || '',
        avatar: this.generateAvatar(userData.name),
        preferences: {
          theme: 'light',
          notifications: true,
          ...userData.profile?.preferences
        }
      },
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: null,
      metadata: {
        source: 'api',
        ipAddress: userData.ipAddress || null,
        userAgent: userData.userAgent || null
      }
    };

    // Save to database
    await this.database.users.create(user);
    this.users.set(user.id, user);

    this.logger.info('User created successfully', {
      id: user.id,
      email: user.email
    });

    return this.sanitizeUser(user);
  }

  async getUserById(id) {
    this.logger.debug('Fetching user by ID', { id });

    // Check cache first
    let user = this.users.get(id);

    if (!user) {
      // Fetch from database
      user = await this.database.users.findById(id);
      if (user) {
        this.users.set(id, user);
      }
    }

    if (!user) {
      throw new NotFoundError(`User with ID ${id} not found`);
    }

    return this.sanitizeUser(user);
  }

  async findUserByEmail(email) {
    const normalizedEmail = email.toLowerCase();

    // Check cache
    for (const [, user] of this.users) {
      if (user.email === normalizedEmail) {
        return user;
      }
    }

    // Check database
    const user = await this.database.users.findByEmail(normalizedEmail);
    if (user) {
      this.users.set(user.id, user);
    }

    return user;
  }

  async updateUser(id, updates) {
    this.logger.debug('Updating user', { id, fields: Object.keys(updates) });

    const user = await this.getUserById(id);

    // Validate updates
    if (updates.email && updates.email !== user.email) {
      const existingUser = await this.findUserByEmail(updates.email);
      if (existingUser && existingUser.id !== id) {
        throw new ConflictError('Email already in use');
      }
    }

    // Merge updates
    const updatedUser = {
      ...user,
      ...updates,
      password: user.password, // Don't allow password updates here
      updatedAt: new Date()
    };

    // Handle nested profile updates
    if (updates.profile) {
      updatedUser.profile = {
        ...user.profile,
        ...updates.profile
      };
    }

    // Save to database
    await this.database.users.update(id, updatedUser);
    this.users.set(id, updatedUser);

    this.logger.info('User updated successfully', { id });
    return this.sanitizeUser(updatedUser);
  }

  async deleteUser(id) {
    this.logger.debug('Deleting user', { id });

    const user = await this.getUserById(id);

    // Business rules
    if (user.role === 'admin') {
      const adminCount = await this.countUsersByRole('admin');
      if (adminCount <= 1) {
        throw new ValidationError('Cannot delete the last admin user');
      }
    }

    // Soft delete by updating status
    const deletedUser = {
      ...user,
      status: 'deleted',
      deletedAt: new Date(),
      updatedAt: new Date()
    };

    await this.database.users.update(id, deletedUser);
    this.users.delete(id);

    this.logger.info('User deleted successfully', { id });
  }

  async listUsers(options = {}) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status = 'active',
      role
    } = options;

    this.logger.debug('Listing users', { page, limit, sortBy, sortOrder });

    const filters = { status };
    if (role) {
      filters.role = role;
    }

    const result = await this.database.users.findMany({
      filters,
      pagination: { page, limit },
      sort: { [sortBy]: sortOrder }
    });

    // Cache the results
    result.items.forEach(user => {
      this.users.set(user.id, user);
    });

    return {
      ...result,
      items: result.items.map(user => this.sanitizeUser(user))
    };
  }

  async searchUsers(query, options = {}) {
    this.logger.debug('Searching users', { query, options });

    const { role, status = 'active' } = options;

    const searchOptions = {
      query,
      fields: ['name', 'email', 'profile.firstName', 'profile.lastName'],
      filters: { status }
    };

    if (role) {
      searchOptions.filters.role = role;
    }

    const users = await this.database.users.search(searchOptions);

    return users.map(user => this.sanitizeUser(user));
  }

  async authenticateUser(email, password) {
    this.logger.debug('Authenticating user', { email });

    const user = await this.findUserByEmail(email);
    if (!user) {
      throw new NotFoundError('Invalid email or password');
    }

    if (user.status !== 'active') {
      throw new ValidationError('Account is not active');
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new ValidationError('Invalid email or password');
    }

    // Update last login
    const updatedUser = {
      ...user,
      lastLoginAt: new Date(),
      updatedAt: new Date()
    };

    await this.database.users.update(user.id, updatedUser);
    this.users.set(user.id, updatedUser);

    this.logger.info('User authenticated successfully', { id: user.id });
    return this.sanitizeUser(updatedUser);
  }

  async changePassword(id, currentPassword, newPassword) {
    this.logger.debug('Changing password', { id });

    const user = await this.database.users.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      throw new ValidationError('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, this.saltRounds);

    const updatedUser = {
      ...user,
      password: hashedPassword,
      updatedAt: new Date()
    };

    await this.database.users.update(id, updatedUser);
    this.users.set(id, updatedUser);

    this.logger.info('Password changed successfully', { id });
  }

  async getUserStats(id) {
    this.logger.debug('Getting user stats', { id });

    const user = await this.getUserById(id);

    // This would integrate with other services
    const stats = {
      id: user.id,
      memberSince: user.createdAt,
      lastLogin: user.lastLoginAt,
      totalLogins: Math.floor(Math.random() * 100), // Mock data
      activityScore: Math.floor(Math.random() * 100),
      achievements: ['early-adopter', 'power-user'],
      preferences: user.profile.preferences
    };

    return stats;
  }

  // Complex business logic methods
  async promoteToAdmin(id, promotedBy) {
    this.logger.debug('Promoting user to admin', { id, promotedBy });

    const user = await this.getUserById(id);
    const promoter = await this.getUserById(promotedBy);

    if (promoter.role !== 'admin') {
      throw new ValidationError('Only admins can promote users');
    }

    if (user.role === 'admin') {
      throw new ValidationError('User is already an admin');
    }

    const updatedUser = {
      ...user,
      role: 'admin',
      updatedAt: new Date(),
      metadata: {
        ...user.metadata,
        promotedBy,
        promotedAt: new Date()
      }
    };

    await this.database.users.update(id, updatedUser);
    this.users.set(id, updatedUser);

    this.logger.info('User promoted to admin', { id, promotedBy });
    return this.sanitizeUser(updatedUser);
  }

  async getUserActivity(id, startDate, endDate) {
    this.logger.debug('Getting user activity', { id, startDate, endDate });

    // This would integrate with analytics service
    const activities = [
      {
        type: 'login',
        timestamp: new Date(),
        metadata: { ip: '192.168.1.1' }
      },
      {
        type: 'profile_update',
        timestamp: new Date(Date.now() - 86400000), // 1 day ago
        metadata: { fields: ['name', 'email'] }
      }
    ];

    return activities.filter(activity => {
      const activityDate = activity.timestamp;
      return activityDate >= startDate && activityDate <= endDate;
    });
  }

  // Helper methods
  validateUserData(userData) {
    const errors = [];

    if (!userData.email || !this.isValidEmail(userData.email)) {
      errors.push('Valid email is required');
    }

    if (!userData.password || userData.password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!userData.name || userData.name.trim().length === 0) {
      errors.push('Name is required');
    }

    if (errors.length > 0) {
      throw new ValidationError(`Validation failed: ${errors.join(', ')}`);
    }
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  generateAvatar(name) {
    const initials = name.split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&size=200&background=random`;
  }

  sanitizeUser(user) {
    const { password, ...sanitized } = user;
    return sanitized;
  }

  async countUsersByRole(role) {
    return await this.database.users.count({ role, status: 'active' });
  }
}