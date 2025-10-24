/**
 * 型別安全檢查器
 * 檢測 any 型別使用、@ts-ignore、as any、tsconfig strict 模式
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 型別安全檢查結果
 */
export interface TypeSafetyResult {
  readonly anyTypeCount: number;
  readonly tsIgnoreCount: number;
  readonly asAnyCount: number;
  readonly strictModeEnabled: boolean;
  readonly strictNullChecksEnabled: boolean;
}

/**
 * 型別安全檢查器
 */
export class TypeSafetyChecker {
  /**
   * 檢查檔案的型別安全問題
   */
  async check(files: string[], projectRoot: string): Promise<TypeSafetyResult> {
    let anyTypeCount = 0;
    let tsIgnoreCount = 0;
    let asAnyCount = 0;

    for (const file of files) {
      if (!this.isTypeScriptFile(file)) {
        continue;
      }

      try {
        const content = await fs.readFile(file, 'utf-8');

        // 檢測 any 型別使用（: any）
        const anyMatches = content.match(/:\s*any\b/g);
        if (anyMatches) {
          anyTypeCount += anyMatches.length;
        }

        // 檢測 @ts-ignore
        const tsIgnoreMatches = content.match(/@ts-ignore/g);
        if (tsIgnoreMatches) {
          tsIgnoreCount += tsIgnoreMatches.length;
        }

        // 檢測 as any 和 <any>
        const asAnyMatches = content.match(/as\s+any\b/g);
        if (asAnyMatches) {
          asAnyCount += asAnyMatches.length;
        }

        const castAnyMatches = content.match(/<any>/g);
        if (castAnyMatches) {
          asAnyCount += castAnyMatches.length;
        }
      } catch {
        // 忽略無法讀取的檔案
      }
    }

    // 檢查 tsconfig.json
    const tsconfigResult = await this.checkTsConfig(projectRoot);

    return {
      anyTypeCount,
      tsIgnoreCount,
      asAnyCount,
      strictModeEnabled: tsconfigResult.strictModeEnabled,
      strictNullChecksEnabled: tsconfigResult.strictNullChecksEnabled,
    };
  }

  /**
   * 檢查 tsconfig.json 的 strict 設定
   */
  private async checkTsConfig(projectRoot: string): Promise<{
    strictModeEnabled: boolean;
    strictNullChecksEnabled: boolean;
  }> {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');

    try {
      const content = await fs.readFile(tsconfigPath, 'utf-8');
      const config = JSON.parse(content);
      const compilerOptions = config.compilerOptions || {};

      return {
        strictModeEnabled: compilerOptions.strict === true,
        strictNullChecksEnabled:
          compilerOptions.strictNullChecks === true || compilerOptions.strict === true,
      };
    } catch {
      return {
        strictModeEnabled: false,
        strictNullChecksEnabled: false,
      };
    }
  }

  /**
   * 判斷是否為 TypeScript 檔案
   */
  private isTypeScriptFile(file: string): boolean {
    return file.endsWith('.ts') || file.endsWith('.tsx');
  }
}
