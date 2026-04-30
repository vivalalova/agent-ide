import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { readPackageVersion } from '@interfaces/cli/cli.js';

describe('readPackageVersion', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function createPackageJson(content: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'agent-ide-package-version-'));
    tempDirs.push(dir);
    const packageJsonPath = join(dir, 'package.json');
    writeFileSync(packageJsonPath, content, 'utf-8');
    return packageJsonPath;
  }

  it('reads version from package.json', () => {
    const packageJsonPath = createPackageJson(JSON.stringify({ version: '9.8.7' }));

    expect(readPackageVersion(packageJsonPath)).toBe('9.8.7');
  });

  it('throws when package.json is missing', () => {
    const missingPath = join(tmpdir(), `agent-ide-missing-${Date.now()}.json`);

    expect(() => readPackageVersion(missingPath)).toThrow(/Cannot read package version/);
  });

  it('throws when package.json has no usable version', () => {
    const packageJsonPath = createPackageJson(JSON.stringify({ version: '' }));

    expect(() => readPackageVersion(packageJsonPath)).toThrow(/Invalid package version/);
  });

  it('throws when package.json is invalid JSON', () => {
    const packageJsonPath = createPackageJson('{');

    expect(() => readPackageVersion(packageJsonPath)).toThrow(/Cannot read package version/);
  });
});
