/**
 * User 相關型別定義
 */

export enum UserRole {
  Admin = 'admin',
  Manager = 'manager',
  User = 'user',
  Guest = 'guest'
}

export enum UserStatus {
  Active = 'active',
  Inactive = 'inactive',
  Suspended = 'suspended',
  Deleted = 'deleted'
}

export interface UserAddress {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface UserProfile {
  bio?: string;
  avatar?: string;
  phone?: string;
  website?: string;
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    github?: string;
  };
}

export interface User {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  profile?: UserProfile;
  address?: UserAddress;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export type UserID = string;

export type CreateUserData = Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'lastLoginAt'>;

export type UpdateUserData = Partial<Omit<User, 'id' | 'email' | 'createdAt'>>;

export type UserSummary = Pick<User, 'id' | 'username' | 'email' | 'role' | 'status'>;
