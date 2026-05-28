#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HELP_START = '<!-- agent-ide-help:start -->';
const HELP_END = '<!-- agent-ide-help:end -->';
const BUILT_IN_COMMANDS = new Set(['help']);

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, '..');

export function createSourceCliHelpInvocation(commandArgs, root = repoRoot, platform = process.platform) {
  const tsxExecutable = path.join(root, 'node_modules', '.bin', platform === 'win32' ? 'tsx.cmd' : 'tsx');
  const cliEntry = path.join(root, 'src', 'interfaces', 'cli', 'index.ts');
  return {
    executable: tsxExecutable,
    args: [cliEntry, ...commandArgs]
  };
}

export function isDirectRun(moduleUrl, argvEntry) {
  return argvEntry !== undefined && fileURLToPath(moduleUrl) === path.resolve(argvEntry);
}

export function extractSkillDescription(skillMarkdown) {
  const frontmatter = skillMarkdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) {
    throw new Error('SKILL.md frontmatter not found');
  }

  const descriptionLine = frontmatter[1]
    .split('\n')
    .find(line => line.trim().startsWith('description:'));
  if (!descriptionLine) {
    throw new Error('SKILL.md frontmatter description not found');
  }

  return descriptionLine
    .replace(/^description:\s*/, '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

export function validatePluginDescription(skillMarkdown, pluginJsonText) {
  const skillDescription = extractSkillDescription(skillMarkdown);
  const plugin = JSON.parse(pluginJsonText);
  return plugin.description === skillDescription
    ? []
    : ['plugins/skills/agent-ide/plugin.json description must match SKILL.md frontmatter description'];
}

export function syncPluginDescription(skillMarkdown, pluginJsonText) {
  const skillDescription = extractSkillDescription(skillMarkdown);
  const plugin = JSON.parse(pluginJsonText);
  plugin.description = skillDescription;
  return `${JSON.stringify(plugin, null, 2)}\n`;
}

export function compareCommandSets(referenceCommands, cliCommands) {
  const referenceSet = new Set(referenceCommands);
  const cliSet = new Set(cliCommands);
  const problems = [];

  for (const command of [...cliCommands].sort()) {
    if (!referenceSet.has(command)) {
      problems.push(`missing reference file for command: ${command}`);
    }
  }

  for (const command of [...referenceCommands].sort()) {
    if (!cliSet.has(command)) {
      problems.push(`reference file has no matching CLI command: ${command}`);
    }
  }

  return problems;
}

export function parseCliCommandNames(helpText) {
  const lines = helpText.split(/\r?\n/);
  const commandsIndex = lines.findIndex(line => line.trim() === 'Commands:');
  if (commandsIndex < 0) {
    throw new Error('agent-ide top-level help does not contain a Commands section');
  }

  return lines
    .slice(commandsIndex + 1)
    .map(line => line.match(/^ {2}([a-z][a-z-]*)\b/)?.[1])
    .filter(command => command && !BUILT_IN_COMMANDS.has(command))
    .sort();
}

export function normalizeHelpOutput(helpText, cwd = process.cwd()) {
  const normalized = helpText.replace(/\r\n/g, '\n').trimEnd();
  return normalized.split(cwd).join('<cwd>');
}

export function formatGeneratedHelpBlock(helpText) {
  return [
    '## CLI Help',
    '',
    HELP_START,
    '```text',
    helpText.trimEnd(),
    '```',
    HELP_END
  ].join('\n');
}

export function replaceGeneratedHelpBlock(markdown, _commandName, helpText) {
  const generatedBlock = formatGeneratedHelpBlock(helpText);
  const existingBlockPattern = new RegExp(`## CLI Help\\n\\n${HELP_START}[\\s\\S]*?${HELP_END}`);
  if (existingBlockPattern.test(markdown)) {
    return ensureTrailingNewline(markdown.replace(existingBlockPattern, generatedBlock));
  }

  const paramsSectionPattern = /## 參數\n[\s\S]*?(?=\n## |\n?$)/;
  if (paramsSectionPattern.test(markdown)) {
    return ensureTrailingNewline(markdown.replace(paramsSectionPattern, `${generatedBlock}\n`));
  }

  const nextSectionIndex = markdown.indexOf('\n## ');
  if (nextSectionIndex >= 0) {
    return ensureTrailingNewline(`${markdown.slice(0, nextSectionIndex)}\n\n${generatedBlock}${markdown.slice(nextSectionIndex)}`);
  }

  return ensureTrailingNewline(`${markdown.trimEnd()}\n\n${generatedBlock}`);
}

export function validateGeneratedHelpBlock(markdown, commandName, helpText) {
  const expected = formatGeneratedHelpBlock(helpText);
  const blockPattern = new RegExp(`## CLI Help\\n\\n${HELP_START}[\\s\\S]*?${HELP_END}`);
  const current = markdown.match(blockPattern)?.[0];
  if (current === expected) {
    return [];
  }

  return [`plugins/skills/agent-ide/references/${commandName}.md generated CLI help is stale; run pnpm sync:skill-docs`];
}

function ensureTrailingNewline(value) {
  return `${value.trimEnd()}\n`;
}

function readReferenceCommands(referenceDir) {
  return readdirSync(referenceDir)
    .filter(fileName => fileName.endsWith('.md'))
    .map(fileName => path.basename(fileName, '.md'))
    .sort();
}

function runCommandHelp(commandName) {
  const invocation = createSourceCliHelpInvocation([commandName, '--help']);
  const output = execFileSync(invocation.executable, invocation.args, {
    cwd: repoRoot,
    encoding: 'utf-8'
  });
  return normalizeHelpOutput(output, repoRoot);
}

function readCliCommandNames() {
  const invocation = createSourceCliHelpInvocation(['--help']);
  const output = execFileSync(invocation.executable, invocation.args, {
    cwd: repoRoot,
    encoding: 'utf-8'
  });
  return parseCliCommandNames(output);
}

function main() {
  const write = process.argv.includes('--write');
  const check = process.argv.includes('--check') || !write;
  const skillPath = path.join(repoRoot, 'plugins/skills/agent-ide/SKILL.md');
  const pluginPath = path.join(repoRoot, 'plugins/skills/agent-ide/plugin.json');
  const referenceDir = path.join(repoRoot, 'plugins/skills/agent-ide/references');

  const problems = [];
  const skillMarkdown = readFileSync(skillPath, 'utf-8');
  const pluginJsonText = readFileSync(pluginPath, 'utf-8');

  if (write) {
    const syncedPluginJson = syncPluginDescription(skillMarkdown, pluginJsonText);
    if (syncedPluginJson !== pluginJsonText) {
      writeFileSync(pluginPath, syncedPluginJson);
    }
  } else {
    problems.push(...validatePluginDescription(skillMarkdown, pluginJsonText));
  }

  const referenceCommands = readReferenceCommands(referenceDir);
  const cliCommands = readCliCommandNames();
  const commandSetProblems = compareCommandSets(referenceCommands, cliCommands);
  problems.push(...commandSetProblems);

  if (commandSetProblems.length > 0) {
    console.error('❌ Agent IDE skill docs validation failed:');
    for (const problem of problems) {
      console.error(`- ${problem}`);
    }
    process.exit(1);
  }

  for (const command of cliCommands) {
    const referencePath = path.join(referenceDir, `${command}.md`);
    const markdown = readFileSync(referencePath, 'utf-8');
    const helpText = runCommandHelp(command);

    if (write) {
      const updated = replaceGeneratedHelpBlock(markdown, command, helpText);
      if (updated !== markdown) {
        writeFileSync(referencePath, updated);
      }
      continue;
    }

    if (check) {
      problems.push(...validateGeneratedHelpBlock(markdown, command, helpText));
    }
  }

  if (problems.length > 0) {
    console.error('❌ Agent IDE skill docs validation failed:');
    for (const problem of problems) {
      console.error(`- ${problem}`);
    }
    process.exit(1);
  }

  console.log(write ? '✅ Agent IDE skill docs synchronized' : '✅ Agent IDE skill docs validation passed');
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main();
}
