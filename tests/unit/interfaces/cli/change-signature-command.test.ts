import { describe, expect, it } from 'vitest';

import { SignatureChangeType } from '@core/change-signature/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import {
  parseChangeSignatureChanges,
  resolveChangeSignaturePaths
} from '@interfaces/cli/commands/change-signature.command.js';

describe('resolveChangeSignaturePaths', () => {
  it('uses explicit --path as project root', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/workspace/project/package.json': '{}',
      '/workspace/project/src/service.ts': 'export function target() {}'
    });

    const result = await resolveChangeSignaturePaths({
      resolvedFile: 'src/service.ts',
      pathOption: '/workspace/project',
      cwd: '/workspace',
      fileSystem
    });

    expect(result).toEqual({
      projectRoot: '/workspace/project',
      filePath: '/workspace/project/src/service.ts'
    });
  });

  it('infers nearest project root from absolute target file when --path is omitted', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/repo/tests/fixtures/sample-project/package.json': '{}',
      '/repo/tests/fixtures/sample-project/src/services/user-service.ts': 'export function createUser(data: unknown) { return data; }',
      '/repo/tests/fixtures/js-project/package.json': '{}',
      '/repo/tests/fixtures/js-project/src/api.js': 'createUser("wrong-project");'
    });

    const result = await resolveChangeSignaturePaths({
      resolvedFile: '/repo/tests/fixtures/sample-project/src/services/user-service.ts',
      cwd: '/repo',
      fileSystem
    });

    expect(result).toEqual({
      projectRoot: '/repo/tests/fixtures/sample-project',
      filePath: '/repo/tests/fixtures/sample-project/src/services/user-service.ts'
    });
  });

  it('falls back to cwd when no project marker exists', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/repo/src/service.ts': 'export function target() {}'
    });

    const result = await resolveChangeSignaturePaths({
      resolvedFile: '/repo/src/service.ts',
      cwd: '/repo',
      fileSystem
    });

    expect(result).toEqual({
      projectRoot: '/repo',
      filePath: '/repo/src/service.ts'
    });
  });
});

describe('parseChangeSignatureChanges', () => {
  it('keeps --add default separate from explicit call-site value', () => {
    const changes = parseChangeSignatureChanges({
      add: 'locale:string=en-US',
      callSiteValue: ['locale=runtimeLocale']
    });

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      type: SignatureChangeType.AddParameter,
      name: 'locale',
      defaultValue: '\'en-US\'',
      callSiteValue: 'runtimeLocale'
    });
  });

  it('splits --add parameters without breaking object-literal defaults', () => {
    const changes = parseChangeSignatureChanges({
      add: 'options:Options={ cache: false, retries: 0 },enabled:boolean=false'
    });

    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({
      type: SignatureChangeType.AddParameter,
      name: 'options',
      defaultValue: '{ cache: false, retries: 0 }',
      callSiteValue: '{ cache: false, retries: 0 }'
    });
    expect(changes[1]).toMatchObject({
      type: SignatureChangeType.AddParameter,
      name: 'enabled',
      defaultValue: 'false',
      callSiteValue: 'false'
    });
  });

  it('accepts repeated --add values', () => {
    const changes = parseChangeSignatureChanges({
      add: ['label:string=default', 'enabled:boolean=false']
    });

    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({ name: 'label' });
    expect(changes[1]).toMatchObject({ name: 'enabled' });
  });

  it('fails fast for malformed call-site value mappings', () => {
    expect(() => parseChangeSignatureChanges({
      add: 'label:string=default',
      callSiteValue: ['label']
    })).toThrow('--call-site-value');
  });

  it('fails fast for duplicate call-site value mappings', () => {
    expect(() => parseChangeSignatureChanges({
      add: 'label:string=default',
      callSiteValue: ['label=a', 'label=b']
    })).toThrow('重複');
  });

  it('fails fast when call-site value targets a parameter not added in this command', () => {
    expect(() => parseChangeSignatureChanges({
      add: 'label:string=default',
      callSiteValue: ['missing=runtimeValue']
    })).toThrow('只能指定本次 --add 新增的參數');
  });

  it('fails fast for invalid call-site expressions', () => {
    expect(() => parseChangeSignatureChanges({
      add: 'label:string=default',
      callSiteValue: ['label={']
    })).toThrow('expression 無效');
  });

  it('fails fast when explicit call-site value has no function default', () => {
    expect(() => parseChangeSignatureChanges({
      add: 'label:string',
      callSiteValue: ['label=runtimeLabel']
    })).toThrow('function default');
  });

  it('fails fast for invalid add default expressions', () => {
    expect(() => parseChangeSignatureChanges({
      add: 'options:Options={ cache: true'
    })).toThrow('default 無效');
  });

  it('fails fast for invalid added parameter names', () => {
    expect(() => parseChangeSignatureChanges({
      add: 'bad-name:string=default'
    })).toThrow('參數名稱');
  });

  it('fails fast when add parameter name uses rest syntax', () => {
    expect(() => parseChangeSignatureChanges({
      add: '...labels=[]'
    })).toThrow('參數名稱');
  });

  it('fails fast for invalid TypeScript parameter types', () => {
    expect(() => parseChangeSignatureChanges({
      add: 'label:bad type=default',
      targetFilePath: '/workspace/source.ts'
    })).toThrow('type 無效');
  });

  it('fails fast for TypeScript-only expressions in JavaScript files', () => {
    expect(() => parseChangeSignatureChanges({
      add: 'label:string=default',
      callSiteValue: ['label=runtimeLabel as string'],
      targetFilePath: '/workspace/source.js'
    })).toThrow('JavaScript');
  });

  it('fails fast when JavaScript add default cannot be a parameter initializer', () => {
    expect(() => parseChangeSignatureChanges({
      add: 'label=await getLabel()',
      targetFilePath: '/workspace/source.js'
    })).toThrow('default 無效');
  });
});
