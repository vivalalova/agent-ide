import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  createGlobMovePlan,
  getGlobBaseDir,
  isGlobPattern,
  resolveGlobPattern
} from '@core/move/glob-move-planner.js';

describe('GlobMovePlanner', () => {
  describe('isGlobPattern', () => {
    it.each([
      ['src/utils/*.ts', true],
      ['src/**/index.ts', true],
      ['src/[ab].ts', true],
      ['src/{a,b}.ts', true],
      ['src/utils/index.ts', false]
    ])('Given %s, when checking glob syntax, then returns %s', (pattern, expected) => {
      expect(isGlobPattern(pattern)).toBe(expected);
    });
  });

  describe('getGlobBaseDir', () => {
    it('Given a recursive glob, when resolving the base directory, then returns the stable prefix before the first glob segment', () => {
      expect(getGlobBaseDir('src/deep/**/*.ts')).toBe('src/deep/');
    });

    it('Given a root-level glob, when resolving the base directory, then returns an empty prefix', () => {
      expect(getGlobBaseDir('*.ts')).toBe('');
    });
  });

  describe('resolveGlobPattern', () => {
    it('Given an absolute source pattern, when resolving for file-system glob, then returns a project-relative pattern', () => {
      expect(resolveGlobPattern('/workspace/project/src/utils/*.ts', '/workspace/project')).toBe('src/utils/*.ts');
    });
  });

  describe('createGlobMovePlan', () => {
    it('Given a recursive glob and directory target, when planning moves, then preserves paths below the glob base directory', () => {
      const projectRoot = '/workspace/project';
      const sourceFiles = [
        path.join(projectRoot, 'src/deep/level1/a.ts'),
        path.join(projectRoot, 'src/deep/level1/level2/b.ts')
      ];

      const plan = createGlobMovePlan({
        sourcePattern: 'src/deep/**/*.ts',
        matchedFiles: sourceFiles,
        targetPath: path.join(projectRoot, 'src/flat'),
        projectRoot,
        targetIsDirectory: true
      });

      expect(plan.globPattern).toBe('src/deep/**/*.ts');
      expect(plan.globBaseDir).toBe('src/deep/');
      expect(plan.absoluteGlobBaseDir).toBe(path.join(projectRoot, 'src/deep'));
      expect(plan.movedFiles).toEqual([
        {
          from: sourceFiles[0],
          to: path.join(projectRoot, 'src/flat/level1/a.ts')
        },
        {
          from: sourceFiles[1],
          to: path.join(projectRoot, 'src/flat/level1/level2/b.ts')
        }
      ]);
      expect(Array.from(plan.batchMoveInfo.allMovedFiles.entries())).toEqual(
        plan.movedFiles.map(file => [file.from, file.to])
      );
    });

    it('Given a single matched file and file target, when planning moves, then maps the source to the target path directly', () => {
      const projectRoot = '/workspace/project';
      const sourceFile = path.join(projectRoot, 'src/only/single.ts');
      const targetPath = path.join(projectRoot, 'src/renamed.ts');

      const plan = createGlobMovePlan({
        sourcePattern: 'src/only/*.ts',
        matchedFiles: [sourceFile],
        targetPath,
        projectRoot,
        targetIsDirectory: false
      });

      expect(plan.movedFiles).toEqual([{ from: sourceFile, to: targetPath }]);
      expect(plan.batchMoveInfo.allMovedFiles.get(sourceFile)).toBe(targetPath);
    });
  });
});
