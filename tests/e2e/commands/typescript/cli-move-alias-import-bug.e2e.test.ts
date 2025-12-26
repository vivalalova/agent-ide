/**
 * CLI move 命令 E2E 測試 - Alias Import 在目錄移動時的更新
 *
 * Bug: 當移動目錄時（如 src/modules → src/core），目錄內檔案的 alias import
 * （如 @/modules/monitoring/alarm）應該被更新為新的路徑（@/core/monitoring/alarm）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move - Alias Import 在目錄移動時應正確更新', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('src/modules → src/domain 重命名場景', () => {
    beforeEach(async () => {
      // Given: 設定 tsconfig 路徑別名 @/* → src/*
      await fixture.writeFile('tsconfig.json', JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': ['src/*']
          }
        }
      }, null, 2));
    });

    it('alias import @/modules/... 應更新為 @/domain/...', async () => {
      // Given: modules 目錄下有多個模組，互相使用 alias import
      await fixture.writeFile('src/modules/monitoring/alarm/types.ts', `
export interface Alarm {
  id: string;
  message: string;
}
`);
      await fixture.writeFile('src/modules/energy/billing/billing.service.ts', `
import { Alarm } from '@/modules/monitoring/alarm/types';

export class BillingService {
  getAlarms(): Alarm[] {
    return [];
  }
}
`);

      // When: 移動 src/modules 到 src/domain
      const result = await executeCLI(
        [
          'move',
          'src/modules',
          'src/domain',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      if (result.exitCode !== 0) {
        console.log('STDOUT:', result.stdout);
        console.log('STDERR:', result.stderr);
      }
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 核心驗證：alias import 應該從 @/modules/... 更新為 @/domain/...
      const billingContent = await fixture.readFile('src/domain/energy/billing/billing.service.ts');
      expect(billingContent).toContain('from \'@/domain/monitoring/alarm/types\'');
      expect(billingContent).not.toContain('@/modules/');
    });

    it('多個 alias import 都應正確更新', async () => {
      // Given: 一個檔案有多個 alias import
      await fixture.writeFile('src/modules/shared/types.ts', `
export type ID = string;
`);
      await fixture.writeFile('src/modules/shared/utils.ts', `
export function format(s: string) { return s.trim(); }
`);
      await fixture.writeFile('src/modules/monitoring/alarm/alarm.service.ts', `
import { ID } from '@/modules/shared/types';
import { format } from '@/modules/shared/utils';

export class AlarmService {
  findById(id: ID) { return format(id); }
}
`);

      // When: 移動 src/modules 到 src/domain
      const result = await executeCLI(
        [
          'move',
          'src/modules',
          'src/domain',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);

      const serviceContent = await fixture.readFile('src/domain/monitoring/alarm/alarm.service.ts');
      expect(serviceContent).toContain('from \'@/domain/shared/types\'');
      expect(serviceContent).toContain('from \'@/domain/shared/utils\'');
      expect(serviceContent).not.toContain('@/modules/');
    });

    it('index.ts barrel export 的 alias import 也應更新', async () => {
      // Given: 使用 index.ts 作為 barrel export
      await fixture.writeFile('src/modules/monitoring/alarm/types.ts', `
export interface Alarm { id: string; }
`);
      await fixture.writeFile('src/modules/monitoring/alarm/index.ts', `
export * from './types';
`);
      await fixture.writeFile('src/modules/energy/billing/billing.service.ts', `
import { Alarm } from '@/modules/monitoring/alarm';

export class BillingService {
  alarms: Alarm[] = [];
}
`);

      // When: 移動 src/modules 到 src/domain
      const result = await executeCLI(
        [
          'move',
          'src/modules',
          'src/domain',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);

      const billingContent = await fixture.readFile('src/domain/energy/billing/billing.service.ts');
      // 應該更新為 @/domain/monitoring/alarm
      expect(billingContent).toContain('from \'@/domain/monitoring/alarm\'');
      expect(billingContent).not.toContain('@/modules/');
    });

    it('混合 alias 和相對路徑 import 應正確處理', async () => {
      // Given: 同時有 alias 和相對路徑 import
      await fixture.writeFile('src/modules/monitoring/alarm/types.ts', `
export interface Alarm { id: string; }
`);
      await fixture.writeFile('src/modules/monitoring/alarm/alarm.service.ts', `
import { Alarm } from './types';
`);
      await fixture.writeFile('src/modules/energy/billing/billing.service.ts', `
import { Alarm } from '@/modules/monitoring/alarm/types';
import { AlarmService } from '../../monitoring/alarm/alarm.service';

export class BillingService {}
`);

      // When
      const result = await executeCLI(
        [
          'move',
          'src/modules',
          'src/domain',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);

      // alarm.service 的相對路徑應保持不變
      const alarmContent = await fixture.readFile('src/domain/monitoring/alarm/alarm.service.ts');
      expect(alarmContent).toContain('from \'./types\'');

      // billing.service 的 alias import 應更新
      const billingContent = await fixture.readFile('src/domain/energy/billing/billing.service.ts');
      expect(billingContent).toContain('from \'@/domain/monitoring/alarm/types\'');
      // 相對路徑也應保持不變（因為相對位置沒變）
      expect(billingContent).toContain('from \'../../monitoring/alarm/alarm.service\'');
    });
  });
});
