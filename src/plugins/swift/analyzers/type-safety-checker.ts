/**
 * Swift 型別安全檢查器
 * 檢測 Any、as?、as!、try!、implicitly unwrapped optionals
 */

/**
 * 型別安全檢查結果
 */
export interface TypeSafetyResult {
  readonly anyTypeCount: number;
  readonly forceCastCount: number;
  readonly optionalCastCount: number;
  readonly forceUnwrapCount: number;
  readonly forceTryCount: number;
  readonly implicitlyUnwrappedCount: number;
}

/**
 * Swift 型別安全檢查器
 */
export class TypeSafetyChecker {
  /**
   * 檢查檔案的型別安全問題
   */
  async check(files: string[], fileContents: Map<string, string>): Promise<TypeSafetyResult> {
    let anyTypeCount = 0;
    let forceCastCount = 0;
    let optionalCastCount = 0;
    let forceUnwrapCount = 0;
    let forceTryCount = 0;
    let implicitlyUnwrappedCount = 0;

    for (const file of files) {
      if (!this.isSwiftFile(file)) {
        continue;
      }

      const content = fileContents.get(file);
      if (!content) {
        continue;
      }

      // 檢測 Any 型別使用
      const anyMatches = content.match(/:\s*Any\b/g);
      if (anyMatches) {
        anyTypeCount += anyMatches.length;
      }

      // 檢測強制轉型 as!
      const forceCastMatches = content.match(/\bas!\s+\w+/g);
      if (forceCastMatches) {
        forceCastCount += forceCastMatches.length;
      }

      // 檢測可選轉型 as?
      const optionalCastMatches = content.match(/\bas\?\s+\w+/g);
      if (optionalCastMatches) {
        optionalCastCount += optionalCastMatches.length;
      }

      // 檢測強制 unwrap !（排除宣告）
      const forceUnwrapMatches = this.detectForceUnwrap(content);
      forceUnwrapCount += forceUnwrapMatches;

      // 檢測 try! 強制執行
      const forceTryMatches = content.match(/\btry!\s+/g);
      if (forceTryMatches) {
        forceTryCount += forceTryMatches.length;
      }

      // 檢測 implicitly unwrapped optionals（Type!）
      const implicitlyUnwrappedMatches = content.match(/:\s*\w+!/g);
      if (implicitlyUnwrappedMatches) {
        implicitlyUnwrappedCount += implicitlyUnwrappedMatches.length;
      }
    }

    return {
      anyTypeCount,
      forceCastCount,
      optionalCastCount,
      forceUnwrapCount,
      forceTryCount,
      implicitlyUnwrappedCount
    };
  }

  /**
   * 檢測強制 unwrap（排除型別宣告）
   */
  private detectForceUnwrap(content: string): number {
    let count = 0;
    const lines = content.split('\n');

    for (const line of lines) {
      // 跳過型別宣告行（包含 : Type!）
      if (/:\s*\w+!/.test(line)) {
        continue;
      }

      // 跳過註解
      if (line.trim().startsWith('//')) {
        continue;
      }

      // 檢測 variable! 使用
      const matches = line.match(/\w+!/g);
      if (matches) {
        // 過濾掉型別宣告
        for (const match of matches) {
          // 檢查前面是否有冒號（型別宣告）
          const index = line.indexOf(match);
          if (index > 0 && line[index - 1] !== ':') {
            count++;
          }
        }
      }
    }

    return count;
  }

  /**
   * 判斷是否為 Swift 檔案
   */
  private isSwiftFile(file: string): boolean {
    return file.endsWith('.swift');
  }

  /**
   * 計算總風險分數（加權計算）
   */
  calculateRiskScore(result: TypeSafetyResult): number {
    return (
      result.anyTypeCount * 2 +          // Any 型別權重 2
      result.forceCastCount * 5 +        // 強制轉型權重 5（高風險）
      result.optionalCastCount * 1 +     // 可選轉型權重 1（較安全）
      result.forceUnwrapCount * 4 +      // 強制 unwrap 權重 4
      result.forceTryCount * 5 +         // try! 權重 5（高風險）
      result.implicitlyUnwrappedCount * 3 // IUO 權重 3
    );
  }
}

/**
 * 預設導出檢查函式
 */
export default async function checkTypeSafety(
  files: string[],
  fileContents: Map<string, string>
): Promise<TypeSafetyResult> {
  const checker = new TypeSafetyChecker();
  return checker.check(files, fileContents);
}
