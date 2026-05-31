import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImpactAnalyzer } from '@core/impact/impact-analyzer.js';
import {
  ParserRegistry,
  registerDefaultParserFactory,
  resetDefaultParserFactoriesForTesting
} from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { createToyParser } from '../../../helpers/toy-parser.js';

describe('ImpactAnalyzer language extension support', () => {
  beforeEach(() => {
    ParserRegistry.resetInstance();
    resetDefaultParserFactoriesForTesting();
    registerDefaultParserFactory(() => createToyParser());
  });

  afterEach(() => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();
  });

  it('builds dependency and cycle data from parser-provided dependencies', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/a.toy': 'import \'./b.toy\'\nsymbol A\n',
      '/project/b.toy': 'import \'./a.toy\'\nsymbol B\n'
    });

    const analyzer = new ImpactAnalyzer(fileSystem);
    const project = await analyzer.analyzeProject('/project');

    expect(project.fileDependencies.map(file => file.filePath).sort()).toEqual([
      '/project/a.toy',
      '/project/b.toy'
    ]);
    expect(analyzer.getDependencies('/project/a.toy')).toEqual(['/project/b.toy']);
    expect(analyzer.getDependents('/project/a.toy')).toEqual(['/project/b.toy']);
    expect(analyzer.getStats().circularDependencies).toBeGreaterThan(0);
  });
});
