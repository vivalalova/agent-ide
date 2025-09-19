export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

export interface UserPreferences {
  theme: 'light' | 'dark';
  language: string;
}

export type UserWithPreferences = User & UserPreferences;