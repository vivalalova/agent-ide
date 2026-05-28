import { describe, expect, it } from 'vitest';

import {
  compareCommandSets,
  createSourceCliHelpInvocation,
  extractSkillDescription,
  isDirectRun,
  parseCliCommandNames,
  replaceGeneratedHelpBlock,
  validateGeneratedHelpBlock,
  validatePluginDescription
} from '../../../scripts/validate-agent-ide-skill-docs.js';

describe('validate-agent-ide-skill-docs helpers', () => {
  it('uses the TypeScript source CLI for help generation instead of ignored dist output', () => {
    expect(createSourceCliHelpInvocation(['rename', '--help'], '/repo', 'linux')).toEqual({
      executable: '/repo/node_modules/.bin/tsx',
      args: ['/repo/src/interfaces/cli/index.ts', 'rename', '--help']
    });
  });

  it('detects direct script execution when the repo path contains spaces', () => {
    expect(
      isDirectRun(
        'file:///Users/me/project%20dir/scripts/validate-agent-ide-skill-docs.js',
        '/Users/me/project dir/scripts/validate-agent-ide-skill-docs.js'
      )
    ).toBe(true);
  });

  it('extracts the SKILL.md frontmatter description', () => {
    const skill = [
      '---',
      'name: agent-ide',
      'description: "Use Agent IDE"',
      '---',
      '',
      '# Agent IDE'
    ].join('\n');

    expect(extractSkillDescription(skill)).toBe('Use Agent IDE');
  });

  it('detects plugin.json description drift from SKILL.md', () => {
    const problems = validatePluginDescription(
      ['---', 'description: "trigger rich"', '---'].join('\n'),
      JSON.stringify({ description: 'stale' })
    );

    expect(problems).toEqual([
      'plugins/skills/agent-ide/plugin.json description must match SKILL.md frontmatter description'
    ]);
  });

  it('detects missing and extra command reference files', () => {
    expect(compareCommandSets(['cycles', 'stale'], ['cycles', 'rename'])).toEqual([
      'missing reference file for command: rename',
      'reference file has no matching CLI command: stale'
    ]);
  });

  it('parses real command names from top-level CLI help and ignores built-in help', () => {
    const help = [
      'Usage: agent-ide [options] [command]',
      '',
      'Commands:',
      '  rename [options]                                  重新命名程式碼元素',
      '  change-signature [options] [file] [functionName]  修改函式簽名',
      '  help [command]                                    display help for command'
    ].join('\n');

    expect(parseCliCommandNames(help)).toEqual(['change-signature', 'rename']);
  });

  it('replaces a handwritten parameter section with generated CLI help', () => {
    const markdown = [
      '# cycles',
      '',
      '檢測專案循環依賴。',
      '',
      '## 參數',
      '',
      '- stale option text',
      '',
      '## 範例',
      '',
      'npx agent-ide cycles --path .'
    ].join('\n');

    expect(replaceGeneratedHelpBlock(markdown, 'cycles', 'Usage: agent-ide cycles [options]')).toContain([
      '## CLI Help',
      '',
      '<!-- agent-ide-help:start -->',
      '```text',
      'Usage: agent-ide cycles [options]',
      '```',
      '<!-- agent-ide-help:end -->',
      '',
      '## 範例'
    ].join('\n'));
  });

  it('reports stale generated CLI help blocks', () => {
    const markdown = replaceGeneratedHelpBlock(
      '# cycles\n\n## 參數\n\n- old\n',
      'cycles',
      'Usage: agent-ide cycles [options]'
    );

    expect(validateGeneratedHelpBlock(markdown, 'cycles', 'Usage: agent-ide cycles [options]')).toEqual([]);
    expect(validateGeneratedHelpBlock(markdown, 'cycles', 'Usage: agent-ide cycles [new]')).toEqual([
      'plugins/skills/agent-ide/references/cycles.md generated CLI help is stale; run pnpm sync:skill-docs'
    ]);
  });
});
