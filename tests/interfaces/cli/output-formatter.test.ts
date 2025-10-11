/**
 * OutputFormatter 測試
 * 測試各種輸出格式的格式化功能
 */

import { describe, it, expect } from 'vitest';
import { OutputFormatter, OutputFormat } from '../../../src/interfaces/cli/output-formatter.js';

describe('OutputFormatter', () => {
  describe('Markdown 格式', () => {
    const formatter = new OutputFormatter(OutputFormat.Markdown);

    it('應該格式化標題', () => {
      expect(formatter.formatTitle('測試標題', 1)).toBe('# 測試標題');
      expect(formatter.formatTitle('測試標題', 2)).toBe('## 測試標題');
      expect(formatter.formatTitle('測試標題', 3)).toBe('### 測試標題');
    });

    it('應該格式化列表', () => {
      const items = ['項目 1', '項目 2', '項目 3'];
      const result = formatter.formatList(items);
      expect(result).toContain('- 項目 1');
      expect(result).toContain('- 項目 2');
      expect(result).toContain('- 項目 3');
    });

    it('應該格式化表格', () => {
      const headers = ['名稱', '數量'];
      const rows = [
        ['檔案', '150'],
        ['符號', '1245']
      ];
      const result = formatter.formatTable(headers, rows);
      expect(result).toContain('| 名稱 | 數量 |');
      expect(result).toContain('|------|------|');
      expect(result).toContain('| 檔案 | 150 |');
      expect(result).toContain('| 符號 | 1245 |');
    });

    it('應該格式化代碼塊', () => {
      const code = 'function test() {}';
      const result = formatter.formatCodeBlock(code, 'typescript');
      expect(result).toContain('```typescript');
      expect(result).toContain(code);
      expect(result).toContain('```');
    });

    it('應該格式化統計資訊', () => {
      const stats = {
        totalFiles: 150,
        totalSymbols: 1245,
        duration: 2300
      };
      const result = formatter.formatStats(stats);
      expect(result).toContain('totalFiles');
      expect(result).toContain('150');
      expect(result).toContain('totalSymbols');
      expect(result).toContain('1245');
    });

    it('應該格式化成功訊息', () => {
      const result = formatter.formatSuccess('操作完成', { files: 10 });
      expect(result).toContain('✅');
      expect(result).toContain('操作完成');
    });

    it('應該格式化錯誤訊息', () => {
      const error = new Error('測試錯誤');
      const result = formatter.formatError(error);
      expect(result).toContain('❌');
      expect(result).toContain('測試錯誤');
    });

    it('應該格式化進度資訊', () => {
      const result = formatter.formatProgress(50, 100, '處理檔案');
      expect(result).toContain('50');
      expect(result).toContain('100');
      expect(result).toContain('處理檔案');
    });
  });

  describe('Plain 格式', () => {
    const formatter = new OutputFormatter(OutputFormat.Plain);

    it('應該格式化標題', () => {
      const result = formatter.formatTitle('測試標題', 1);
      expect(result).toContain('測試標題');
      expect(result).not.toContain('#');
    });

    it('應該格式化列表', () => {
      const items = ['項目 1', '項目 2'];
      const result = formatter.formatList(items);
      expect(result).toContain('項目 1');
      expect(result).toContain('項目 2');
    });

    it('應該格式化表格', () => {
      const headers = ['名稱', '數量'];
      const rows = [['檔案', '150']];
      const result = formatter.formatTable(headers, rows);
      expect(result).toContain('名稱');
      expect(result).toContain('數量');
      expect(result).toContain('檔案');
      expect(result).toContain('150');
    });

    it('應該格式化統計資訊', () => {
      const stats = { totalFiles: 150 };
      const result = formatter.formatStats(stats);
      expect(result).toContain('totalFiles');
      expect(result).toContain('150');
    });

    it('應該格式化成功訊息', () => {
      const result = formatter.formatSuccess('操作完成');
      expect(result).toContain('✅');
      expect(result).toContain('操作完成');
    });

    it('應該格式化錯誤訊息', () => {
      const result = formatter.formatError('測試錯誤');
      expect(result).toContain('❌');
      expect(result).toContain('測試錯誤');
    });
  });

  describe('JSON 格式', () => {
    const formatter = new OutputFormatter(OutputFormat.Json);

    it('應該輸出有效的 JSON', () => {
      const result = formatter.formatSuccess('操作完成', { files: 10 });
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('應該包含 status 和 message', () => {
      const result = formatter.formatSuccess('操作完成');
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('success');
      expect(parsed.message).toBe('操作完成');
    });

    it('應該格式化錯誤為 JSON', () => {
      const result = formatter.formatError(new Error('測試錯誤'));
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('error');
      expect(parsed.message).toContain('測試錯誤');
    });

    it('應該格式化統計資訊為 JSON', () => {
      const stats = { totalFiles: 150, totalSymbols: 1245 };
      const result = formatter.formatStats(stats);
      const parsed = JSON.parse(result);
      expect(parsed.totalFiles).toBe(150);
      expect(parsed.totalSymbols).toBe(1245);
    });
  });

  describe('Minimal 格式', () => {
    const formatter = new OutputFormatter(OutputFormat.Minimal);

    it('應該輸出單行格式', () => {
      const result = formatter.formatSuccess('操作完成', { files: 10 });
      expect(result.split('\n').length).toBeLessThanOrEqual(2);
    });

    it('應該使用 key=value 格式', () => {
      const stats = { totalFiles: 150, totalSymbols: 1245 };
      const result = formatter.formatStats(stats);
      expect(result).toMatch(/totalFiles=150/);
      expect(result).toMatch(/totalSymbols=1245/);
    });

    it('應該格式化錯誤為簡潔格式', () => {
      const result = formatter.formatError('測試錯誤');
      expect(result).toContain('error');
      expect(result).toContain('測試錯誤');
      expect(result.length).toBeLessThan(100);
    });

    it('應該移除 emoji', () => {
      const result = formatter.formatSuccess('操作完成');
      expect(result).not.toContain('✅');
      expect(result).not.toContain('❌');
    });
  });

  describe('複雜情境', () => {
    it('應該處理空列表', () => {
      const formatter = new OutputFormatter(OutputFormat.Markdown);
      const result = formatter.formatList([]);
      expect(result).toBe('');
    });

    it('應該處理空統計', () => {
      const formatter = new OutputFormatter(OutputFormat.Markdown);
      const result = formatter.formatStats({});
      expect(result).toBeTruthy();
    });

    it('應該處理特殊字元', () => {
      const formatter = new OutputFormatter(OutputFormat.Markdown);
      const result = formatter.formatTitle('特殊字元: | * # []', 1);
      expect(result).toContain('特殊字元');
    });

    it('應該處理多行文字', () => {
      const formatter = new OutputFormatter(OutputFormat.Markdown);
      const multiline = '第一行\n第二行\n第三行';
      const result = formatter.formatCodeBlock(multiline);
      expect(result).toContain('第一行');
      expect(result).toContain('第二行');
      expect(result).toContain('第三行');
    });
  });
});
