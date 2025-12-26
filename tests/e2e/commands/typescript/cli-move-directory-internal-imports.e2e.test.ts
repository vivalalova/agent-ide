/**
 * CLI move 命令 E2E 測試 - 目錄移動內部引用保持不變
 *
 * 當整個目錄被移動時，目錄內部檔案之間的相對引用（如 ./alarm.service）
 * 不應該被修改，因為它們的相對位置沒有改變。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move - 目錄移動內部引用保持不變', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('模擬真實場景：frontend/alarm → modules/frontend/alarm', () => {
    it('同目錄內的 ./service 引用不應被修改', async () => {
      // Given: 建立 frontend/alarm 目錄結構，模擬 NestJS 模組
      await fixture.writeFile('src/frontend/alarm/alarm.service.ts', `
import { Injectable } from '@nestjs/common';

@Injectable()
export class AlarmService {
  findAll() {
    return ['alarm1', 'alarm2'];
  }
}
`);
      await fixture.writeFile('src/frontend/alarm/alarm.controller.ts', `
import { Controller, Get } from '@nestjs/common';
import { AlarmService } from './alarm.service';

@Controller('alarm')
export class AlarmController {
  constructor(private readonly alarmService: AlarmService) {}

  @Get()
  findAll() {
    return this.alarmService.findAll();
  }
}
`);

      // When: 移動整個 frontend/alarm 到 modules/frontend/alarm
      const result = await executeCLI(
        [
          'move',
          'src/frontend/alarm',
          'src/modules/frontend/alarm',
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

      // 核心驗證：./alarm.service 引用應該保持不變
      const controllerContent = await fixture.readFile('src/modules/frontend/alarm/alarm.controller.ts');
      expect(controllerContent).toContain("from './alarm.service'");
      // 不應該被改成奇怪的路徑
      expect(controllerContent).not.toContain('../../modules/frontend');
      expect(controllerContent).not.toContain('../../frontend/alarm');
    });

    it('同目錄內的 ./dto/xxx 引用不應被修改', async () => {
      // Given: 包含 dto 子目錄的結構
      await fixture.writeFile('src/frontend/alarm/dto/alarm.dto.ts', `
export class CreateAlarmDto {
  name: string;
  severity: number;
}
`);
      await fixture.writeFile('src/frontend/alarm/dto/alarm-response.dto.ts', `
import { CreateAlarmDto } from './alarm.dto';

export class AlarmResponseDto extends CreateAlarmDto {
  id: string;
  createdAt: Date;
}
`);
      await fixture.writeFile('src/frontend/alarm/alarm.service.ts', `
import { CreateAlarmDto } from './dto/alarm.dto';
import { AlarmResponseDto } from './dto/alarm-response.dto';

export class AlarmService {
  create(dto: CreateAlarmDto): AlarmResponseDto {
    return { ...dto, id: '1', createdAt: new Date() };
  }
}
`);

      // When: 移動整個目錄
      const result = await executeCLI(
        [
          'move',
          'src/frontend/alarm',
          'src/modules/frontend/alarm',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 驗證 dto 內部引用保持不變
      const dtoContent = await fixture.readFile('src/modules/frontend/alarm/dto/alarm-response.dto.ts');
      expect(dtoContent).toContain("from './alarm.dto'");

      // 驗證 service 對 dto 的引用保持不變
      const serviceContent = await fixture.readFile('src/modules/frontend/alarm/alarm.service.ts');
      expect(serviceContent).toContain("from './dto/alarm.dto'");
      expect(serviceContent).toContain("from './dto/alarm-response.dto'");
    });

    it('外部引用應該被正確更新', async () => {
      // Given: 外部檔案引用 frontend/alarm
      await fixture.writeFile('src/frontend/alarm/alarm.service.ts', `
export class AlarmService {}
`);
      await fixture.writeFile('src/app.module.ts', `
import { AlarmService } from './frontend/alarm/alarm.service';

export class AppModule {
  services = [AlarmService];
}
`);

      // When: 移動 frontend/alarm 到 modules/frontend/alarm
      const result = await executeCLI(
        [
          'move',
          'src/frontend/alarm',
          'src/modules/frontend/alarm',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 外部引用應該被更新
      expect(result.exitCode).toBe(0);

      const appModuleContent = await fixture.readFile('src/app.module.ts');
      // 舊路徑不應存在
      expect(appModuleContent).not.toContain('./frontend/alarm');
      // 新路徑應該存在
      expect(appModuleContent).toContain('./modules/frontend/alarm/alarm.service');
    });
  });

  describe('深層嵌套目錄移動', () => {
    it('多層子目錄內的相對引用都應保持不變', async () => {
      // Given: 三層嵌套結構
      await fixture.writeFile('src/frontend/alarm/core/base.ts', `
export abstract class BaseAlarm {
  abstract process(): void;
}
`);
      await fixture.writeFile('src/frontend/alarm/core/impl/alarm-impl.ts', `
import { BaseAlarm } from '../base';

export class AlarmImpl extends BaseAlarm {
  process() {
    console.log('processing');
  }
}
`);
      await fixture.writeFile('src/frontend/alarm/services/alarm.service.ts', `
import { AlarmImpl } from '../core/impl/alarm-impl';

export class AlarmService {
  private impl = new AlarmImpl();
}
`);

      // When: 移動整個 frontend/alarm
      const result = await executeCLI(
        [
          'move',
          'src/frontend/alarm',
          'src/modules/frontend/alarm',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 所有相對引用應該保持不變
      expect(result.exitCode).toBe(0);

      // 驗證 ../base 引用保持不變
      const implContent = await fixture.readFile('src/modules/frontend/alarm/core/impl/alarm-impl.ts');
      expect(implContent).toContain("from '../base'");

      // 驗證 ../core/impl/alarm-impl 引用保持不變
      const serviceContent = await fixture.readFile('src/modules/frontend/alarm/services/alarm.service.ts');
      expect(serviceContent).toContain("from '../core/impl/alarm-impl'");
    });
  });
});
