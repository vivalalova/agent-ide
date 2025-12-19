/**
 * Bug #32 測試：class 有成員被使用時，整個 class 不應被刪除
 */

/**
 * 這個 class 有 public method 被使用，整個 class 不應被刪除
 * 即使 class 本身沒有直接引用（如 new UsedServiceClass()）
 */
export class UsedServiceClass {
  /**
   * 被使用的 public 方法
   */
  public usedMethod(): string {
    return 'used';
  }

  /**
   * 未使用的 private 方法（使用唯一名稱避免同名符號問題）
   */
  private bug32UnusedPrivateMethod(): string {
    return 'unused';
  }
}

// 建立實例並使用 public 方法
const service = new UsedServiceClass();
service.usedMethod();

/**
 * 這個 class 完全沒有被使用 - 應該被標記為 dead code
 */
class TotallyUnusedClass {
  public someMethod(): void {
    console.log('never called');
  }
}
