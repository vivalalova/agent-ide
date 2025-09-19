import { User, UserPreferences, UserWithPreferences } from '../types/user';

export class UserService {
  private users: User[] = [];

  async createUser(userData: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const user: User = {
      id: this.generateId(),
      ...userData,
      createdAt: new Date()
    };
    
    this.users.push(user);
    return user;
  }

  async findUserById(id: number): Promise<User | null> {
    return this.users.find(user => user.id === id) || null;
  }

  async updateUserPreferences(
    userId: number,
    preferences: UserPreferences
  ): Promise<UserWithPreferences | null> {
    const user = await this.findUserById(userId);
    if (!user) return null;
    
    return { ...user, ...preferences };
  }

  private generateId(): number {
    return Math.max(0, ...this.users.map(u => u.id)) + 1;
  }
}