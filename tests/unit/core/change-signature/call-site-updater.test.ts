import { describe, expect, it } from 'vitest';

import { CallSiteUpdater } from '@core/change-signature/call-site-updater.js';
import {
  SignatureChangeType,
  type FunctionSignature,
  type SignatureChange
} from '@core/change-signature/types.js';
import type { CallSite } from '@core/foundations/symbol-finder/index.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { Location, Range } from '@shared/types/core.js';

const range: Range = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 1 }
};

const location: Location = {
  filePath: '/workspace/source.ts',
  range
};

function createSignature(parameters: FunctionSignature['parameters']): FunctionSignature {
  return {
    name: 'configure',
    parameters,
    location,
    isMethod: false,
    modifiers: []
  };
}

function createCallSite(argumentValues: readonly string[]): CallSite {
  return {
    functionName: 'configure',
    location,
    arguments: argumentValues.map((value, index) => ({
      index,
      value,
      range
    })),
    isMethodCall: false
  };
}

describe('CallSiteUpdater', () => {
  it('maps multiple appended add-parameter call-site values by their final index', () => {
    const updater = new CallSiteUpdater({} as IFileSystem, {} as ParserRegistry);
    const originalSignature = createSignature([
      { name: 'id', optional: false, rest: false, range }
    ]);
    const changes: SignatureChange[] = [
      {
        type: SignatureChangeType.AddParameter,
        name: 'label',
        parameterType: 'string',
        defaultValue: '\'default\'',
        optional: true,
        position: -1,
        callSiteValue: '\'runtime\''
      },
      {
        type: SignatureChangeType.AddParameter,
        name: 'enabled',
        parameterType: 'boolean',
        defaultValue: 'false',
        optional: true,
        position: -1,
        callSiteValue: 'true'
      },
      {
        type: SignatureChangeType.AddParameter,
        name: 'options',
        parameterType: 'Options',
        defaultValue: '{ cache: false, retries: 0 }',
        optional: true,
        position: -1,
        callSiteValue: '{ cache: true, retries: 2 }'
      },
      {
        type: SignatureChangeType.AddParameter,
        name: 'locale',
        parameterType: 'string',
        defaultValue: '\'en-US\'',
        optional: true,
        position: -1,
        callSiteValue: 'runtimeLocale'
      }
    ];

    const mapping = updater.createParameterMapping(originalSignature, originalSignature, changes);
    const updatedArguments = updater.mapCallSiteArguments(
      createCallSite(['\'profile\'']),
      mapping,
      changes,
      originalSignature
    );

    expect(updatedArguments).toEqual([
      '\'profile\'',
      '\'runtime\'',
      'true',
      '{ cache: true, retries: 2 }',
      'runtimeLocale'
    ]);
  });
});
