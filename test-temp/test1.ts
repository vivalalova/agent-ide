export function getUserById(id: number): User {
  return database.findUser(id);
}

export class UserService {
  async fetchUser(userId: number) {
    return await this.api.get(`/users/${userId}`);
  }
}