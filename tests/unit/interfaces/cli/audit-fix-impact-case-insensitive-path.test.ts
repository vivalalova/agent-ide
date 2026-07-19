/**
 * P1 回歸：磁碟檔名 Target.ts，使用者在大小寫不敏感檔案系統上跑
 * `impact --file src/target.ts`（小寫 t）。
 *
 * 真實場景：exists() 在大小寫不敏感 FS 上對錯誤大小寫仍回 true 通過前置檢查，
 * 但 impact-analyzer 依賴圖以掃描到的原始大小寫（Target.ts）建節點，
 * getImpactedFiles/getDependencies 查找只做 path.resolve 字串比對 → 找不到節點，
 * dependents/dependencies 全空、totalAffected 0、success:true（靜默假成功）。
 *
 * tests/helpers 的 MemFileSystem（@lova/mem-vfs）本身是大小寫敏感的（見本檔
 * probe：exists('/project/target.ts') 對實際檔名 'Target.ts' 回 false），
 * 無法在 memfs 上重現「大小寫不敏感 FS」這個前提，因此改用一個包裝
 * MemFileSystem、只把 exists/isFile/getStats/readFile 疊加大小寫不敏感查找的
 * fake FileSystem 直接餵給 CLI（readDirectory 維持原始大小寫，符合
 * file-scanner 用它建圖節點的真實行為），在 CLI 層端對端重現這個缺陷。
 */
import { describe, expect, it } from 'vitest';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { executeCLI } from '../../../helpers/cli-executor.js';

/**
 * 模擬大小寫不敏感的檔案系統（如預設設定的 macOS/Windows）：
 * exists/isFile/getStats/readFile 對錯誤大小寫仍解析到磁碟上實際存在的檔案，
 * 但 readDirectory（file-scanner 建圖節點的依據）維持磁碟上真實大小寫不變。
 */
class CaseInsensitiveMemFileSystem extends MemFileSystem {
  /** 大小寫不敏感解析：找不到精確路徑時，退回找唯一大小寫相符的實際路徑 */
  private resolveActualPath(targetPath: string): string {
    const allFiles = Object.keys(this.toJSON());
    if (allFiles.includes(targetPath)) {
      return targetPath;
    }
    const lowerTarget = targetPath.toLowerCase();
    const match = allFiles.find(file => file.toLowerCase() === lowerTarget);
    return match ?? targetPath;
  }

  override async exists(targetPath: string): Promise<boolean> {
    return super.exists(this.resolveActualPath(targetPath));
  }

  override async isFile(targetPath: string): Promise<boolean> {
    return super.isFile(this.resolveActualPath(targetPath));
  }

  override async getStats(targetPath: string) {
    return super.getStats(this.resolveActualPath(targetPath));
  }

  override async readFile(targetPath: string, encoding?: BufferEncoding) {
    return super.readFile(this.resolveActualPath(targetPath), encoding);
  }
}

describe('audit-fix P1: impact --file 大小寫與磁碟實際大小寫不符', () => {
  it('probe: MemFileSystem 本身大小寫敏感（確認需另建大小寫不敏感 fake FS）', async () => {
    const memfs = new MemFileSystem();
    await memfs.fromJSON({ '/project/Target.ts': 'export const target = 1;' });

    expect(await memfs.exists('/project/Target.ts')).toBe(true);
    expect(await memfs.exists('/project/target.ts')).toBe(false);
  });

  it('正確大小寫（對照組）：impact --file Target.ts 回報非零 totalAffected', async () => {
    const memfs = new CaseInsensitiveMemFileSystem();
    await memfs.fromJSON({
      '/project/Target.ts': 'export const target = 1;',
      '/project/consumer.ts': 'import { target } from \'./Target.js\';\nconsole.log(target);\n'
    });

    const result = await executeCLI(
      ['impact', '--file', 'Target.ts', '--path', '/project', '--format', 'json'],
      { memfs: memfs as unknown as MemFileSystem }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout) as {
      success: boolean;
      impact: { totalAffected: number; dependents: string[] };
    };
    expect(output.success).toBe(true);
    expect(output.impact.totalAffected).toBeGreaterThan(0);
  });

  it('錯誤大小寫（大小寫不敏感 FS 上使用者輸入 target.ts）：禁止靜默回報 success:true 且 totalAffected===0', async () => {
    const memfs = new CaseInsensitiveMemFileSystem();
    await memfs.fromJSON({
      '/project/Target.ts': 'export const target = 1;',
      '/project/consumer.ts': 'import { target } from \'./Target.js\';\nconsole.log(target);\n'
    });

    const result = await executeCLI(
      ['impact', '--file', 'target.ts', '--path', '/project', '--format', 'json'],
      { memfs: memfs as unknown as MemFileSystem }
    );

    const output = JSON.parse(result.stdout) as {
      success: boolean;
      impact?: { totalAffected: number };
    };

    // 正確行為二選一：
    // (a) 正規化到磁碟實際大小寫，totalAffected 與對照組一致（>0）
    // (b) 明確報錯「檔案不在索引中」（success:false / 非 0 exit code）
    // 禁止：success:true 且 totalAffected===0 的靜默假成功
    const isSilentFalseSuccess = output.success === true && output.impact?.totalAffected === 0;
    expect(isSilentFalseSuccess).toBe(false);
  });
});
