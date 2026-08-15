/**
 * Adversarial reproduction pins for move-member TypeScript extractor bugs.
 * Product code intentionally NOT fixed — these must stay red until fixed.
 */
import { describe, expect, it } from 'vitest';
import {
  extractTypeScriptMember,
  listTypeScriptMembers
} from '@core/move-member/extractors/typescript-extractor.js';
import { MemberType } from '@core/move-member/types.js';
import { findTypeAliasEnd } from '@core/move-member/utils/range-finder.js';

describe('move-member extractor adversarial bugs', () => {
  describe('P1: class method body statements mis-extracted as properties', () => {
    it('must not invent a Property named return inside a method body', () => {
      const content = [
        'export class C {',
        '  run() {',
        '    return 1;',
        '  }',
        '}',
        ''
      ].join('\n');

      const members = listTypeScriptMembers(content, '/src/c.ts');
      const fakeProps = members.filter(
        m => m.type === MemberType.Property && m.name === 'return'
      );
      expect(fakeProps).toEqual([]);

      const methods = members.filter(m => m.type === MemberType.Method && m.name === 'run');
      expect(methods).toHaveLength(1);
    });

    it('position on return line must select method run, not a fake property', () => {
      const content = [
        'export class C {',
        '  run() {',
        '    return 1;',
        '  }',
        '}',
        ''
      ].join('\n');

      const members = listTypeScriptMembers(content, '/src/c.ts');
      const returnLine = 3; // 1-based
      const containing = members.filter(m => {
        const start = m.location.range.start.line;
        const end = m.location.range.end.line;
        return returnLine >= start && returnLine <= end;
      });
      const nonClass = containing.filter(m => m.type !== MemberType.Class);
      const selected = nonClass.reduce((smallest, current) => {
        const smallestSize = smallest.location.range.end.line - smallest.location.range.start.line;
        const currentSize = current.location.range.end.line - current.location.range.start.line;
        return currentSize < smallestSize ? current : smallest;
      });

      expect(selected.type).toBe(MemberType.Method);
      expect(selected.name).toBe('run');
    });
  });

  describe('P1: generic / multiline methods not extracted', () => {
    it('extracts generic class method map<T>(...)', () => {
      const content = [
        'export class Mapper {',
        '  map<T>(items: T[]): T[] {',
        '    return items;',
        '  }',
        '}',
        ''
      ].join('\n');

      const member = extractTypeScriptMember(content, '/src/mapper.ts', 'map');
      expect(member).not.toBeNull();
      expect(member!.type).toBe(MemberType.Method);
      expect(member!.sourceCode).toContain('map<T>');
      expect(member!.sourceCode).toContain('return items');
    });

    it('must not treat multi-line method parameters as class properties', () => {
      const content = [
        'export class C {',
        '  foo(',
        '    a: number,',
        '    b: string',
        '  ) {',
        '    return a + b;',
        '  }',
        '}',
        ''
      ].join('\n');

      const members = listTypeScriptMembers(content, '/src/c.ts');
      const method = members.find(m => m.name === 'foo' && m.type === MemberType.Method);
      expect(method).toBeDefined();
      // Parameters and body keywords must not appear as Property members
      const fakeProps = members.filter(
        m => m.type === MemberType.Property && ['a', 'b', 'return'].includes(m.name)
      );
      expect(fakeProps).toEqual([]);
    });
  });

  describe('P2: getters/setters not extracted', () => {
    it('extracts getter as method', () => {
      const content = [
        'export class C {',
        '  get value() {',
        '    return 1;',
        '  }',
        '}',
        ''
      ].join('\n');

      const member = extractTypeScriptMember(content, '/src/c.ts', 'value');
      expect(member).not.toBeNull();
      expect(member!.type).toBe(MemberType.Method);
      expect(member!.sourceCode).toContain('get value');
    });
  });

  describe('P2: multi-line object type alias truncated', () => {
    it('findTypeAliasEnd includes entire object type body', () => {
      const lines = [
        'export type User = {',
        '  id: string;',
        '  name: string;',
        '};'
      ];
      expect(findTypeAliasEnd(lines, 0)).toBe(3);
    });

    it('extractTypeScriptMember keeps full multi-line object type', () => {
      const content = [
        'export type User = {',
        '  id: string;',
        '  name: string;',
        '};',
        ''
      ].join('\n');

      const member = extractTypeScriptMember(content, '/src/types.ts', 'User');
      expect(member).not.toBeNull();
      expect(member!.sourceCode).toContain('id: string');
      expect(member!.sourceCode).toContain('name: string');
      expect(member!.sourceCode.trim().endsWith('};')).toBe(true);
    });
  });
});
