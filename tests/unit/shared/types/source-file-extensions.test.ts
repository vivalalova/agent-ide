import { describe, expect, it } from 'vitest';
import {
  getSourceLanguage,
  isSourceFileExtension,
  stripSourceFileExtension
} from '@shared/types/source-file-extensions.js';

describe('source file extensions', () => {
  it.each([
    ['/workspace/src/component.ts', '/workspace/src/component'],
    ['/workspace/src/component.tsx', '/workspace/src/component'],
    ['/workspace/src/module.mts', '/workspace/src/module'],
    ['/workspace/src/module.cts', '/workspace/src/module'],
    ['/workspace/src/component.js', '/workspace/src/component'],
    ['/workspace/src/component.jsx', '/workspace/src/component'],
    ['/workspace/src/module.mjs', '/workspace/src/module'],
    ['/workspace/src/module.cjs', '/workspace/src/module']
  ])('strips supported source extension from %s', (filePath, expected) => {
    expect(stripSourceFileExtension(filePath)).toBe(expected);
  });

  it.each([
    ['/p/foo.d.ts', '/p/foo'],
    ['/workspace/src/module.d.mts', '/workspace/src/module'],
    ['/workspace/src/module.d.cts', '/workspace/src/module']
  ])('strips declaration file extension as a single unit from %s', (filePath, expected) => {
    expect(stripSourceFileExtension(filePath)).toBe(expected);
  });

  it('keeps unsupported extensions unchanged', () => {
    expect(stripSourceFileExtension('/workspace/src/styles.css')).toBe('/workspace/src/styles.css');
  });

  it.each([
    ['.ts', true],
    ['.tsx', true],
    ['.js', true],
    ['.jsx', true],
    ['.css', false]
  ])('classifies %s as source extension: %s', (extension, expected) => {
    expect(isSourceFileExtension(extension)).toBe(expected);
  });

  it.each([
    ['.ts', 'typescript'],
    ['.tsx', 'typescript'],
    ['.js', 'javascript'],
    ['.jsx', 'javascript'],
    ['.css', undefined]
  ])('maps %s to source language %s', (extension, expected) => {
    expect(getSourceLanguage(extension)).toBe(expected);
  });
});
