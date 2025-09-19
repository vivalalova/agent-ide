// 這個檔案會引用被移動的檔案
import { TestInterface, TestClass, TEST_CONSTANT } from './test-folder/test-move-target';

export function createTestInstance(id: number, name: string): TestClass {
  const data: TestInterface = { id, name };
  return new TestClass(data);
}

export function getConstant(): string {
  return TEST_CONSTANT;
}