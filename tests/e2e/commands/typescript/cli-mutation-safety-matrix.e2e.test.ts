/**
 * Cross-command mutation safety matrix.
 *
 * These tests verify destructive or broad mutation behavior at the CLI boundary
 * so preview/apply/failure semantics are covered through real fixture side effects.
 */

import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import * as path from 'path';
import { loadFixture, executeCLI, type FixtureContext, type CLIResult } from '../../../helpers/index.js';

async function withFixture(
  name: string,
  run: (fixture: FixtureContext) => Promise<void>
): Promise<void> {
  const fixture = await loadFixture(name);
  try {
    await run(fixture);
  } finally {
    fixture.cleanup();
  }
}

function parseJson(result: CLIResult): Record<string, any> {
  return JSON.parse(result.stdout) as Record<string, any>;
}

function expectPreviewLineChange(
  output: Record<string, any>,
  filePath: string,
  oldContent: string,
  newContent: string
): void {
  const fileChange = output.files?.find((file: { filePath: string }) => file.filePath === filePath);
  expect(fileChange).toBeDefined();

  const changedLines = fileChange.hunks.flatMap(
    (hunk: { lines: Array<{ type: string; content: string }> }) => hunk.lines
  );
  expect(changedLines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'delete', content: oldContent }),
      expect.objectContaining({ type: 'add', content: newContent })
    ])
  );
}

async function readSnapshot(
  fixture: FixtureContext,
  paths: readonly string[]
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    paths.map(async (filePath) => [filePath, await fixture.readFile(filePath)] as const)
  );
  return Object.fromEntries(entries);
}

async function expectSnapshotUnchanged(
  fixture: FixtureContext,
  snapshot: Record<string, string>
): Promise<void> {
  for (const [filePath, content] of Object.entries(snapshot)) {
    expect(await fixture.readFile(filePath)).toBe(content);
  }
}

function expectCompilableTypeScript(
  fileName: string,
  sourceText: string,
  extraSources: Record<string, string> = {}
): void {
  const sourceFiles = {
    [fileName]: sourceText,
    ...extraSources
  };
  const compilerOptions: ts.CompilerOptions = {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    skipLibCheck: true
  };
  const compilerHost = ts.createCompilerHost(compilerOptions, true);
  const defaultFileExists = compilerHost.fileExists.bind(compilerHost);
  const defaultGetSourceFile = compilerHost.getSourceFile.bind(compilerHost);
  const defaultReadFile = compilerHost.readFile.bind(compilerHost);

  compilerHost.fileExists = (requestedFileName) => {
    if (Object.hasOwn(sourceFiles, requestedFileName)) {
      return true;
    }
    return defaultFileExists(requestedFileName);
  };
  compilerHost.getSourceFile = (
    requestedFileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile
  ) => {
    const source = sourceFiles[requestedFileName];
    if (source !== undefined) {
      return ts.createSourceFile(requestedFileName, source, languageVersion, true, ts.ScriptKind.TS);
    }
    return defaultGetSourceFile(requestedFileName, languageVersion, onError, shouldCreateNewSourceFile);
  };
  compilerHost.readFile = (requestedFileName) => sourceFiles[requestedFileName] ?? defaultReadFile(requestedFileName);
  compilerHost.resolveModuleNames = (moduleNames, containingFile) =>
    moduleNames.map((moduleName) => {
      const extensionlessCandidate = path.posix.resolve(path.posix.dirname(containingFile), `${moduleName}.ts`);
      if (Object.hasOwn(sourceFiles, extensionlessCandidate)) {
        return {
          resolvedFileName: extensionlessCandidate,
          extension: ts.Extension.Ts
        };
      }
      return ts.resolveModuleName(moduleName, containingFile, compilerOptions, compilerHost).resolvedModule;
    });

  const program = ts.createProgram([fileName], compilerOptions, compilerHost);
  const diagnostics = [
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics()
  ];

  expect(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([]);
}

describe('CLI mutation safety matrix', () => {
  it('keeps deadcode preview/default paths separate from explicit apply', async () => {
    await withFixture('deadcode-autofix', async (fixture) => {
      const targetFile = 'src/deadcode.ts';
      const originalContent = await fixture.readFile(targetFile);
      expect(originalContent).toContain('function unusedFunction');

      const dryRunResult = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(dryRunResult.exitCode).toBe(0);
      expect(parseJson(dryRunResult)).toMatchObject({
        previewOnly: true,
        applied: false,
        mode: 'preview'
      });
      expect(await fixture.readFile(targetFile)).toBe(originalContent);

      const defaultResult = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(defaultResult.exitCode).toBe(0);
      expect(parseJson(defaultResult)).toMatchObject({
        previewOnly: true,
        applied: false,
        mode: 'preview'
      });
      expect(await fixture.readFile(targetFile)).toBe(originalContent);

      const applyResult = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(applyResult.exitCode).toBe(0);
      expect(parseJson(applyResult)).toMatchObject({
        previewOnly: false,
        applied: true,
        mode: 'apply'
      });
      expect(await fixture.readFile(targetFile)).not.toContain('function unusedFunction');
    });
  });

  it('previews move file, directory, glob, and member operations without writes', async () => {
    await withFixture('sample-project', async (fixture) => {
      await fixture.writeFile('src/file-dep.ts', 'export const value = 1;\n');
      await fixture.writeFile(
        'src/app.ts',
        'import { value } from \'./file-dep\';\nexport const result = value;\n'
      );
      await fixture.writeFile('src/feature/index.ts', 'export const feature = true;\n');
      await fixture.writeFile('src/use-feature.ts', 'import { feature } from \'./feature\';\nfeature;\n');
      await fixture.writeFile('src/glob/a.ts', 'export const a = 1;\n');
      await fixture.writeFile('src/glob/b.ts', 'export const b = 2;\n');
      await fixture.writeFile(
        'src/glob-consumer.ts',
        'import { a } from \'./glob/a\';\nimport { b } from \'./glob/b\';\nexport const total = a + b;\n'
      );
      await fixture.writeFile(
        'src/member-source.ts',
        'export function selected(): string {\n  return \'selected\';\n}\n\nexport function stay(): string {\n  return \'stay\';\n}\n'
      );
      await fixture.writeFile('src/member-target.ts', 'export const existing = true;\n');
      await fixture.writeFile(
        'src/member-consumer.ts',
        'import { selected } from \'./member-source\';\nexport const text = selected();\n'
      );

      const watchedFiles = [
        'src/file-dep.ts',
        'src/app.ts',
        'src/feature/index.ts',
        'src/use-feature.ts',
        'src/glob/a.ts',
        'src/glob/b.ts',
        'src/glob-consumer.ts',
        'src/member-source.ts',
        'src/member-target.ts',
        'src/member-consumer.ts'
      ] as const;
      const before = await readSnapshot(fixture, watchedFiles);

      const filePreview = await executeCLI(
        [
          'move',
          'src/file-dep.ts',
          'src/shared/file-dep.ts',
          '--path', fixture.rootPath,
          '--dry-run',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(filePreview.exitCode).toBe(0);
      const fileOutput = parseJson(filePreview);
      expect(fileOutput.finalTarget).toBe(fixture.getFilePath('src/shared/file-dep.ts'));
      expectPreviewLineChange(
        fileOutput,
        fixture.getFilePath('src/app.ts'),
        'import { value } from \'./file-dep\';',
        'import { value } from \'./shared/file-dep\';'
      );
      expect(await fixture.exists('src/shared/file-dep.ts')).toBe(false);

      const directoryPreview = await executeCLI(
        [
          'move',
          'src/feature',
          'src/modules/feature',
          '--path', fixture.rootPath,
          '--dry-run',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(directoryPreview.exitCode).toBe(0);
      const directoryOutput = parseJson(directoryPreview);
      expect(directoryOutput.finalTarget).toBe(fixture.getFilePath('src/modules/feature'));
      expectPreviewLineChange(
        directoryOutput,
        fixture.getFilePath('src/use-feature.ts'),
        'import { feature } from \'./feature\';',
        'import { feature } from \'./modules/feature/index\';'
      );
      expect(await fixture.exists('src/modules/feature/index.ts')).toBe(false);

      const globPreview = await executeCLI(
        [
          'move',
          'src/glob/*.ts',
          'src/glob-dest/',
          '--path', fixture.rootPath,
          '--dry-run',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(globPreview.exitCode).toBe(0);
      const globOutput = parseJson(globPreview);
      expect(globOutput.movedFiles).toEqual(
        expect.arrayContaining([
          {
            from: fixture.getFilePath('src/glob/a.ts'),
            to: fixture.getFilePath('src/glob-dest/a.ts')
          },
          {
            from: fixture.getFilePath('src/glob/b.ts'),
            to: fixture.getFilePath('src/glob-dest/b.ts')
          }
        ])
      );
      expect(await fixture.exists('src/glob-dest/a.ts')).toBe(false);
      expect(await fixture.exists('src/glob-dest/b.ts')).toBe(false);
      expectPreviewLineChange(
        globOutput,
        fixture.getFilePath('src/glob-consumer.ts'),
        'import { a } from \'./glob/a\';',
        'import { a } from \'./glob-dest/a\';'
      );
      expectPreviewLineChange(
        globOutput,
        fixture.getFilePath('src/glob-consumer.ts'),
        'import { b } from \'./glob/b\';',
        'import { b } from \'./glob-dest/b\';'
      );

      const memberPreview = await executeCLI(
        [
          'move',
          'src/member-source.ts:1',
          'src/member-target.ts',
          '--path', fixture.rootPath,
          '--dry-run',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(memberPreview.exitCode).toBe(0);
      const memberOutput = parseJson(memberPreview);
      expect(memberOutput.finalTarget).toBe(fixture.getFilePath('src/member-target.ts'));
      expectPreviewLineChange(
        memberOutput,
        fixture.getFilePath('src/member-consumer.ts'),
        'import { selected } from \'./member-source\';',
        'import { selected } from \'./member-target\';'
      );

      await expectSnapshotUnchanged(fixture, before);
    });
  });

  it('applies move imports and file side effects together', async () => {
    await withFixture('sample-project', async (fixture) => {
      await fixture.writeFile('src/move-dep.ts', 'export const movedValue = 42;\n');
      await fixture.writeFile(
        'src/move-consumer.ts',
        'import { movedValue } from \'./move-dep\';\nexport const answer = movedValue;\n'
      );

      const result = await executeCLI(
        [
          'move',
          'src/move-dep.ts',
          'src/applied/move-dep.ts',
          '--path', fixture.rootPath,
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(parseJson(result)).toMatchObject({
        success: true,
        moved: true,
        finalTarget: fixture.getFilePath('src/applied/move-dep.ts')
      });
      expect(await fixture.exists('src/move-dep.ts')).toBe(false);
      expect(await fixture.exists('src/applied/move-dep.ts')).toBe(true);

      const consumerContent = await fixture.readFile('src/move-consumer.ts');
      expect(consumerContent).toContain('./applied/move-dep');
      expect(consumerContent).not.toContain('./move-dep');
      expectCompilableTypeScript(
        fixture.getFilePath('src/move-consumer.ts'),
        consumerContent,
        {
          [fixture.getFilePath('src/applied/move-dep.ts')]: await fixture.readFile('src/applied/move-dep.ts')
        }
      );
    });
  });

  it('applies change-signature operation variants with valid call-site output', async () => {
    await withFixture('sample-project', async (fixture) => {
      const cases = [
        {
          filePath: 'src/sig-add.ts',
          functionName: 'formatName',
          source: 'function formatName(name: string): string {\n  return name;\n}\n\nconst text = formatName(\'Ada\');\n',
          args: ['--add', 'suffix:string=!'],
          assertContent(content: string): void {
            expect(content).toContain('function formatName(name: string, suffix: string = \'!\'): string');
            expect(content).toContain('formatName(\'Ada\', \'!\')');
          }
        },
        {
          filePath: 'src/sig-reorder.ts',
          functionName: 'joinPair',
          source: 'function joinPair(first: string, second: string): string {\n  return first + second;\n}\n\nconst text = joinPair(\'A\', \'B\');\n',
          args: ['--reorder', 'second,first'],
          assertContent(content: string): void {
            expect(content).toContain('function joinPair(second: string, first: string): string');
            expect(content).toContain('joinPair(\'B\', \'A\')');
          }
        },
        {
          filePath: 'src/sig-remove.ts',
          functionName: 'identity',
          source: 'function identity(value: string, unused: number): string {\n  return value;\n}\n\nconst text = identity(\'A\', 1);\n',
          args: ['--remove', 'unused'],
          assertContent(content: string): void {
            expect(content).toContain('function identity(value: string): string');
            expect(content).toContain('identity(\'A\')');
            expect(content).not.toContain('unused');
          }
        },
        {
          filePath: 'src/sig-rename.ts',
          functionName: 'describe',
          source: 'function describe(userId: string): string {\n  return userId.trim();\n}\n\nconst text = describe(\'u1\');\n',
          args: ['--rename', 'userId:accountId'],
          assertContent(content: string): void {
            expect(content).toContain('function describe(accountId: string): string');
            expect(content).toContain('return accountId.trim();');
            expect(content).not.toContain('userId');
          }
        },
        {
          filePath: 'src/sig-change-type.ts',
          functionName: 'count',
          source: 'function count(value: number): number {\n  return Number(value);\n}\n\nconst total = count(42);\n',
          args: ['--change-type', 'value:unknown'],
          assertContent(content: string): void {
            expect(content).toContain('function count(value: unknown): number');
            expect(content).toContain('count(42)');
          }
        }
      ];

      for (const testCase of cases) {
        await fixture.writeFile(testCase.filePath, testCase.source);

        const result = await executeCLI(
          [
            'change-signature',
            fixture.getFilePath(testCase.filePath),
            testCase.functionName,
            '--path', fixture.rootPath,
            ...testCase.args,
            '--format', 'json'
          ],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(parseJson(result).success).toBe(true);

        const updatedContent = await fixture.readFile(testCase.filePath);
        testCase.assertContent(updatedContent);
        expectCompilableTypeScript(fixture.getFilePath(testCase.filePath), updatedContent);
      }
    });
  });

  it('keeps fixtures unchanged when mutation commands fail validation', async () => {
    await withFixture('sample-project', async (fixture) => {
      await fixture.writeFile('src/failure-source.ts', 'export const source = true;\n');
      await fixture.writeFile('src/failure-target.ts', 'export const target = true;\n');
      await fixture.writeFile(
        'src/failure-signature.ts',
        'function render(name: string): string {\n  return name;\n}\n\nconst output = render(\'home\');\n'
      );

      const before = await readSnapshot(fixture, [
        'src/failure-source.ts',
        'src/failure-target.ts',
        'src/failure-signature.ts'
      ]);

      const deadcodeFailure = await executeCLI(
        [
          'deadcode',
          '--path', `${fixture.rootPath}/missing-deadcode-root`,
          '--apply',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(deadcodeFailure.exitCode).toBe(1);
      expect(parseJson(deadcodeFailure).success).toBe(false);

      const moveFailure = await executeCLI(
        [
          'move',
          'src/failure-source.ts',
          'src/failure-target.ts',
          '--path', fixture.rootPath,
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(moveFailure.exitCode).toBe(1);
      expect(parseJson(moveFailure).success).toBe(false);

      const signatureFailure = await executeCLI(
        [
          'change-signature',
          'src/failure-signature.ts',
          'render',
          '--path', fixture.rootPath,
          '--add', ':string=default',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(signatureFailure.exitCode).toBe(1);
      expect(parseJson(signatureFailure).success).toBe(false);

      const globFailure = await executeCLI(
        [
          'move',
          'src/no-match/*.ts',
          'src/no-match-target/',
          '--path', fixture.rootPath,
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(globFailure.exitCode).toBe(1);
      expect(parseJson(globFailure).success).toBe(false);

      await expectSnapshotUnchanged(fixture, before);
      expect(await fixture.exists('src/no-match-target/a.ts')).toBe(false);
    });
  });
});
