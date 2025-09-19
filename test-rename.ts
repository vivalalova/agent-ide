interface User {
  id: string;
  name: string;
  email: string;
}

export class UserService {
  private users: User[] = [];

  constructor() {
    this.initializeUsers();
  }

  private initializeUsers(): void {
    console.log('Initializing user service');
  }

  public findUserById(id: string): User | undefined {
    return this.users.find(user => user.id === id);
  }

  public createUser(name: string, email: string): User {
    const newUser: User = {
      id: Math.random().toString(36),
      name,
      email
    };
    
    this.users.push(newUser);
    return newUser;
  }
}

// 一些使用實例
const userService = new UserService();
const testUser = userService.createUser('Test User', 'test@example.com');