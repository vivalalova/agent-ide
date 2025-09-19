import { UserService } from './user-service';
import { User } from '../types/user';

async function main() {
  const userService = new UserService();
  
  // 建立新使用者
  const newUser = await userService.createUser({
    name: 'John Doe',
    email: 'john@example.com'
  });
  
  console.log('Created user:', newUser);
  
  // 取得使用者
  const user = await userService.findUserById(newUser.id);
  console.log('Retrieved user:', user);
  
  // 更新偏好設定
  const userWithPrefs = await userService.updateUserPreferences(newUser.id, {
    theme: 'dark',
    language: 'en'
  });
  
  console.log('User with preferences:', userWithPrefs);
}

main().catch(console.error);