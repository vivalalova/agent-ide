/**
 * Interface/Type 屬性測試
 * 用於驗證 interface/type 的屬性不應被標記為 dead code
 */

// Interface 定義 - 屬性不應被檢測為 dead code
export interface TestConfig {
  name: string;
  value: number;
  isEnabled: boolean;
}

// Type 定義 - 屬性不應被檢測為 dead code
export type UserData = {
  id: string;
  email: string;
};

// 測試用 interface（模擬 .spec.ts 使用情境）
export interface TestCase {
  expectedSeverity: string;
  contractCapacity: number;
}

// 使用 interface 的程式碼
const config: TestConfig = { name: 'test', value: 42, isEnabled: true };
console.log(config.name);

const user: UserData = { id: '123', email: 'test@example.com' };
console.log(user.id);

const testCase: TestCase = { expectedSeverity: 'high', contractCapacity: 100 };
console.log(testCase.expectedSeverity);
