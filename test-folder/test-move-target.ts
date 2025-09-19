// 測試移動的原始檔案
export interface TestInterface {
  id: number;
  name: string;
}

export class TestClass {
  constructor(private data: TestInterface) {}
  
  getId(): number {
    return this.data.id;
  }
  
  getName(): string {
    return this.data.name;
  }
}

export const TEST_CONSTANT = 'test-value';