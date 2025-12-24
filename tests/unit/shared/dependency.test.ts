import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyGraph } from '@core/foundations/dependency-graph/index.js';
import { CycleDetector, calculateCycleSeverity, createDefaultCycleDetectionOptions, isCircularDependency, type CircularDependency } from '@core/cycles/index.js';
import {
  createDefaultAnalysisOptions,
  createDefaultQueryOptions,
  isFileDependencies,
  isProjectDependencies,
  type FileDependencies,
  type ProjectDependencies,
} from '@core/impact/index.js';

// ============================================================================
// Types and Factory Functions Tests
// ============================================================================

describe('Dependency Types Factory Functions', () => {
  describe('createDefaultAnalysisOptions', () => {
    it('should return default analysis options', () => {
      const options = createDefaultAnalysisOptions();

      expect(options.includeNodeModules).toBe(false);
      expect(options.followSymlinks).toBe(true);
      expect(options.maxDepth).toBe(100);
      expect(options.excludePatterns).toContain('node_modules');
      expect(options.excludePatterns).toContain('.git');
      expect(options.includePatterns).toContain('**/*.ts');
      expect(options.includePatterns).toContain('**/*.js');
    });
  });

  describe('createDefaultQueryOptions', () => {
    it('should return default query options', () => {
      const options = createDefaultQueryOptions();

      expect(options.includeTransitive).toBe(false);
      expect(options.maxDepth).toBe(10);
      expect(options.direction).toBe('dependencies');
    });
  });

  describe('createDefaultCycleDetectionOptions', () => {
    it('should return default cycle detection options', () => {
      const options = createDefaultCycleDetectionOptions();

      expect(options.maxCycleLength).toBe(20);
      expect(options.reportAllCycles).toBe(false);
      expect(options.ignoreSelfLoops).toBe(true);
    });
  });
});

describe('Type Guards', () => {
  describe('isFileDependencies', () => {
    it('should return true for valid FileDependencies', () => {
      const valid: FileDependencies = {
        filePath: '/src/a.ts',
        dependencies: [],
        lastModified: new Date(),
      };

      expect(isFileDependencies(valid)).toBe(true);
    });

    it('should return false for invalid objects', () => {
      expect(isFileDependencies(null)).toBe(false);
      expect(isFileDependencies(undefined)).toBe(false);
      expect(isFileDependencies({})).toBe(false);
      expect(isFileDependencies({ filePath: '' })).toBe(false);
      expect(isFileDependencies({ filePath: '/a.ts' })).toBe(false);
    });
  });

  describe('isProjectDependencies', () => {
    it('should return true for valid ProjectDependencies', () => {
      const valid: ProjectDependencies = {
        projectPath: '/project',
        fileDependencies: [{
          filePath: '/project/a.ts',
          dependencies: [],
          lastModified: new Date(),
        }],
        analyzedAt: new Date(),
      };

      expect(isProjectDependencies(valid)).toBe(true);
    });

    it('should return false for invalid objects', () => {
      expect(isProjectDependencies(null)).toBe(false);
      expect(isProjectDependencies(undefined)).toBe(false);
      expect(isProjectDependencies({})).toBe(false);
    });
  });

  describe('isCircularDependency', () => {
    it('should return true for valid CircularDependency', () => {
      const valid: CircularDependency = {
        cycle: ['/a.ts', '/b.ts'],
        length: 2,
        severity: 'low',
      };

      expect(isCircularDependency(valid)).toBe(true);
    });

    it('should return false for invalid objects', () => {
      expect(isCircularDependency(null)).toBe(false);
      expect(isCircularDependency(undefined)).toBe(false);
      expect(isCircularDependency({})).toBe(false);
      expect(isCircularDependency({ cycle: [], length: 0 })).toBe(false);
    });
  });
});

describe('Utility Functions', () => {
  describe('calculateCycleSeverity', () => {
    it('should return low for cycles <= 3', () => {
      expect(calculateCycleSeverity(1)).toBe('low');
      expect(calculateCycleSeverity(2)).toBe('low');
      expect(calculateCycleSeverity(3)).toBe('low');
    });

    it('should return medium for cycles 4-6', () => {
      expect(calculateCycleSeverity(4)).toBe('medium');
      expect(calculateCycleSeverity(5)).toBe('medium');
      expect(calculateCycleSeverity(6)).toBe('medium');
    });

    it('should return high for cycles > 6', () => {
      expect(calculateCycleSeverity(7)).toBe('high');
      expect(calculateCycleSeverity(10)).toBe('high');
      expect(calculateCycleSeverity(100)).toBe('high');
    });
  });
});
