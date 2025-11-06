/**
 * 類別成員的 deadcode 檢測測試
 */

export class TestClass {
  // ❌ 非 DEADCODE: public 屬性可能被外部訪問
  public publicProp: string = 'public';

  // ❌ 非 DEADCODE: protected 屬性可能被子類別使用
  protected protectedProp: string = 'protected';

  // ✅ DEADCODE: private 屬性未被使用
  private unusedPrivateProp: string = 'unused';

  // ❌ 非 DEADCODE: private 屬性有被使用
  private usedPrivateProp: string = 'used';

  constructor() {
    // 使用 usedPrivateProp
    console.log(this.usedPrivateProp);
  }

  // ❌ 非 DEADCODE: public 方法
  public publicMethod() {
    return this.publicProp;
  }

  // ❌ 非 DEADCODE: protected 方法
  protected protectedMethod() {
    return this.protectedProp;
  }

  // ✅ DEADCODE: private 方法未被使用
  private unusedPrivateMethod() {
    return 'unused';
  }

  // ❌ 非 DEADCODE: private 方法有被使用
  private usedPrivateMethod() {
    return 'used';
  }

  public callPrivate() {
    return this.usedPrivateMethod();
  }
}

// ❌ 非 DEADCODE: 子類別繼承
export class DerivedClass extends TestClass {
  useProtected() {
    return this.protectedMethod(); // 使用父類別的 protected 方法
  }
}

// ✅ DEADCODE: 未使用的內部類別
class UnusedInternalClass {
  method() {
    return 'internal';
  }
}

// ❌ 非 DEADCODE: 有被使用的內部類別
class UsedInternalClass {
  method() {
    return 'used internal';
  }
}

export function useInternalClass() {
  const instance = new UsedInternalClass();
  return instance.method();
}
