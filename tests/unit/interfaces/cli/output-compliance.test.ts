import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

describe('CLI output compliance', () => {
  it('routes JSON output through the unified output layer instead of command-level console.log', () => {
    const commandsDir = path.join(process.cwd(), 'src/interfaces/cli/commands');
    const commandFiles = readdirSync(commandsDir)
      .filter(fileName => fileName.endsWith('.ts'))
      .map(fileName => path.join(commandsDir, fileName));

    const directJsonOutputs = commandFiles.flatMap(filePath => {
      const source = readFileSync(filePath, 'utf-8');
      return source.match(/console\.log\(\s*JSON\.stringify/g)?.map(match => ({
        filePath,
        match
      })) ?? [];
    });

    expect(directJsonOutputs).toEqual([]);
  });
});
