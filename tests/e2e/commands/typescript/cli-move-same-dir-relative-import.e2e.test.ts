/**
 * CLI move 命令 E2E 測試 - 單檔案移動到子目錄時更新同目錄相對引用
 *
 * Bug: 當移動單一檔案到子目錄時，同目錄內使用 `./` 相對路徑引用該檔案的其他檔案
 * 沒有被更新。
 *
 * 範例：
 * - touCalculate.service.ts 引用 from './tou-calculate.interface'
 * - tou-calculate.interface.ts 移動到 interfaces/tou-calculate.interface.ts
 * - 預期：touCalculate.service.ts 更新為 from './interfaces/tou-calculate.interface'
 * - 實際：touCalculate.service.ts 沒被更新（BUG）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move - 單檔案移動到子目錄時更新同目錄相對引用', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('應該更新同目錄內使用 ./ 引用的檔案（純相對路徑）', async () => {
    // Given: 模擬 tou-calculate 模組結構
    await fixture.writeFile('src/tou-calculate/tou-calculate.interface.ts', `
export interface TouData {
  touType: string;
  effectiveFrom: Date;
}

export interface MonthlyContractDetail {
  month: number;
  usage: number;
}
`);
    await fixture.writeFile('src/tou-calculate/touCalculate.service.ts', `
import { Injectable } from '@nestjs/common';
import { TouData, MonthlyContractDetail } from './tou-calculate.interface';

@Injectable()
export class TouCalculateService {
  calculate(data: TouData): MonthlyContractDetail {
    return { month: 1, usage: 100 };
  }
}
`);
    await fixture.writeFile('src/tou-calculate/touCalculate.helper.ts', `
import { TouData } from './tou-calculate.interface';

export function validateTouData(data: TouData): boolean {
  return !!data.touType;
}
`);

    // When: 移動 interface 到 interfaces/ 子目錄
    const result = await executeCLI(
      [
        'move',
        'src/tou-calculate/tou-calculate.interface.ts',
        'src/tou-calculate/interfaces/tou-calculate.interface.ts',
        '--path', fixture.rootPath,
        '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    // Then: 應該成功
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    // 核心驗證：同目錄的 ./ 引用應該被更新
    const serviceContent = await fixture.readFile('src/tou-calculate/touCalculate.service.ts');
    console.log('Service content after move:', serviceContent);

    // 這是 bug 的核心：同目錄的相對路徑應該被更新
    expect(serviceContent).toContain("from './interfaces/tou-calculate.interface'");
    expect(serviceContent).not.toContain("from './tou-calculate.interface'");

    const helperContent = await fixture.readFile('src/tou-calculate/touCalculate.helper.ts');
    console.log('Helper content after move:', helperContent);

    expect(helperContent).toContain("from './interfaces/tou-calculate.interface'");
    expect(helperContent).not.toContain("from './tou-calculate.interface'");
  });

  it('應該同時更新 path alias 和相對路徑的引用', async () => {
    // Given: 配置 tsconfig 使用 @/* path alias
    await fixture.writeFile('tsconfig.json', `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "baseUrl": "./",
    "paths": {
      "@/*": ["src/*"]
    },
    "moduleResolution": "node",
    "esModuleInterop": true
  },
  "include": ["src/**/*"]
}`);

    // 建立模組結構：interface 被多個檔案引用
    await fixture.writeFile('src/tou-calculate/tou-calculate.interface.ts', `
export interface TouData {
  touType: string;
  effectiveFrom: Date;
}

export interface MonthlyContractDetail {
  month: number;
  usage: number;
}
`);

    // 同目錄檔案使用相對路徑引用
    await fixture.writeFile('src/tou-calculate/touCalculate.service.ts', `
import { Injectable } from '@nestjs/common';
import { TouData, MonthlyContractDetail } from './tou-calculate.interface';

@Injectable()
export class TouCalculateService {
  calculate(data: TouData): MonthlyContractDetail {
    return { month: 1, usage: 100 };
  }
}
`);

    // 其他模組使用 path alias 引用
    await fixture.writeFile('src/basic-fee/basicFee.service.ts', `
import { Injectable } from '@nestjs/common';
import { MonthlyContractDetail } from '@/tou-calculate/tou-calculate.interface';

@Injectable()
export class BasicFeeService {
  calculate(detail: MonthlyContractDetail): number {
    return detail.usage * 10;
  }
}
`);

    // When: 移動 interface 到 interfaces/ 子目錄
    const result = await executeCLI(
      [
        'move',
        'src/tou-calculate/tou-calculate.interface.ts',
        'src/tou-calculate/interfaces/tou-calculate.interface.ts',
        '--path', fixture.rootPath,
        '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    // Then: 應該成功
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    // 驗證 1: 同目錄的相對路徑應該被更新
    const serviceContent = await fixture.readFile('src/tou-calculate/touCalculate.service.ts');
    console.log('TouCalculate service content after move:', serviceContent);
    expect(serviceContent).toContain("from './interfaces/tou-calculate.interface'");
    expect(serviceContent).not.toContain("from './tou-calculate.interface'");

    // 驗證 2: path alias 引用也應該被更新
    const basicFeeContent = await fixture.readFile('src/basic-fee/basicFee.service.ts');
    console.log('BasicFee service content after move:', basicFeeContent);
    expect(basicFeeContent).toContain("from '@/tou-calculate/interfaces/tou-calculate.interface'");
    expect(basicFeeContent).not.toContain("from '@/tou-calculate/tou-calculate.interface'");
  });
});
