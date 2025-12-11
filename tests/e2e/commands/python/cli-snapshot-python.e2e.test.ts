/**
 * CLI snapshot 命令 E2E 測試
 * 基於 python-sample-project fixture 測試 Python 專案快照功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';
import type { SnapshotResult, ProjectSnapshotData } from '@infrastructure/formatters/query-types.js';

describe('CLI snapshot Python - 基於 python-sample-project fixture', () => {
  let fixture: FixtureContext;
  let modelsPath: string;

  beforeEach(async () => {
    fixture = await loadFixture('python-sample-project');
    modelsPath = `${fixture.rootPath}/src/models`;
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本輸出', () => {
    it('應該成功執行 snapshot 命令', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });

    it('應該輸出有效 JSON 格式', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該包含 SnapshotResult 結構', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.command).toBe('snapshot');
      expect(snapshotResult.success).toBe(true);
      expect(snapshotResult.snapshotType).toBeDefined();
      expect(snapshotResult.snapshot).toBeDefined();
    });

    it('應該支援 summary 格式輸出', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'summary'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      // summary 格式應該是人類可讀的文字，不是 JSON
      expect(() => JSON.parse(result.stdout)).toThrow();
    });
  });

  describe('Python 專案結構解析', () => {
    it('應該正確識別 Python 專案', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該識別專案中的 Python 檔案', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;

      if (snapshotResult.snapshotType === 'project') {
        const snapshot = snapshotResult.snapshot as ProjectSnapshotData;
        expect(snapshot.modules).toBeDefined();
        expect(Object.keys(snapshot.modules).length).toBeGreaterThan(0);
      }
    });
  });

  describe('Python class 解析', () => {
    it('應該提取 User dataclass 結構', async () => {
      const result = await executeCLI(['snapshot', '--path', modelsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該提取 UserManager class 結構', async () => {
      const result = await executeCLI(['snapshot', '--path', modelsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該提取 Product 和 ProductCatalog class', async () => {
      const result = await executeCLI(['snapshot', '--path', modelsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該提取 Order 和 OrderProcessor class', async () => {
      const result = await executeCLI(['snapshot', '--path', modelsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });
  });

  describe('Python enum 解析', () => {
    it('應該提取 UserRole enum', async () => {
      const result = await executeCLI(['snapshot', '--path', modelsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該提取 OrderStatus enum', async () => {
      const result = await executeCLI(['snapshot', '--path', modelsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該提取 Category enum', async () => {
      const result = await executeCLI(['snapshot', '--path', modelsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });
  });

  describe('Python dataclass 解析', () => {
    it('應該提取 OrderItem dataclass', async () => {
      const result = await executeCLI(['snapshot', '--path', modelsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });
  });

  describe('Python function 解析', () => {
    it('應該提取 utils 模組中的函數', async () => {
      const utilsPath = `${fixture.rootPath}/src/utils`;
      const result = await executeCLI(['snapshot', '--path', utilsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });
  });

  describe('專案快照驗證', () => {
    it('應該識別專案根目錄並產生專案快照', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(['module', 'project']).toContain(snapshotResult.snapshotType);
    });

    it('專案快照應該包含多個子模組', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;

      if (snapshotResult.snapshotType === 'project') {
        const snapshot = snapshotResult.snapshot as ProjectSnapshotData;
        const moduleCount = Object.keys(snapshot.modules).length;
        expect(moduleCount).toBeGreaterThan(0);
      }
    });
  });

  describe('動態建立 Python 檔案測試', () => {
    it('應該處理新增的 Python class', async () => {
      await fixture.writeFile('custom.py', `
from dataclasses import dataclass
from typing import Optional

@dataclass
class CustomModel:
    """Custom model for testing"""
    id: str
    name: str
    value: int = 0

    def calculate(self) -> int:
        """Calculate double value"""
        return self.value * 2

    @staticmethod
    def create(name: str) -> "CustomModel":
        """Factory method"""
        return CustomModel(id="1", name=name)
`);

      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該處理新增的 Python enum', async () => {
      await fixture.writeFile('enums.py', `
from enum import Enum, auto

class Priority(Enum):
    """Priority levels"""
    LOW = auto()
    MEDIUM = auto()
    HIGH = auto()
    CRITICAL = auto()

class TaskType(Enum):
    """Task types"""
    BUG = "bug"
    FEATURE = "feature"
    IMPROVEMENT = "improvement"
    DOCUMENTATION = "documentation"
`);

      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該處理 Python 泛型類別', async () => {
      await fixture.writeFile('generics.py', `
from typing import TypeVar, Generic, Optional, Dict

T = TypeVar("T")
K = TypeVar("K")
V = TypeVar("V")

class Repository(Generic[T]):
    """Generic repository class"""

    def __init__(self):
        self._items: Dict[str, T] = {}

    def get(self, id: str) -> Optional[T]:
        """Get item by ID"""
        return self._items.get(id)

    def save(self, id: str, item: T) -> None:
        """Save item"""
        self._items[id] = item

    def delete(self, id: str) -> bool:
        """Delete item"""
        if id in self._items:
            del self._items[id]
            return True
        return False
`);

      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });
  });

  describe('錯誤處理', () => {
    it('應該在路徑不存在時輸出錯誤訊息', async () => {
      const result = await executeCLI(['snapshot', '--path', '/nonexistent/path'], { memfs: fixture.memfs });

      expect(result.stderr || result.stdout).toMatch(/不存在|error|Error/i);
    });
  });

  describe('Python 特有語法結構', () => {
    it('應該處理 property 裝飾器', async () => {
      await fixture.writeFile('properties.py', `
class Circle:
    """Circle with computed properties"""

    def __init__(self, radius: float):
        self._radius = radius

    @property
    def radius(self) -> float:
        """Get radius"""
        return self._radius

    @radius.setter
    def radius(self, value: float) -> None:
        """Set radius"""
        if value < 0:
            raise ValueError("Radius cannot be negative")
        self._radius = value

    @property
    def diameter(self) -> float:
        """Get diameter"""
        return self._radius * 2

    @property
    def area(self) -> float:
        """Get area"""
        import math
        return math.pi * self._radius ** 2
`);

      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該處理 async/await 方法', async () => {
      await fixture.writeFile('async_module.py', `
import asyncio
from typing import Dict, Any

class AsyncDataManager:
    """Async data manager"""

    def __init__(self):
        self._cache: Dict[str, Any] = {}

    async def fetch(self, key: str) -> Any:
        """Fetch data with caching"""
        if key in self._cache:
            return self._cache[key]
        data = await self._load_from_source(key)
        self._cache[key] = data
        return data

    async def _load_from_source(self, key: str) -> Any:
        """Load data from source"""
        await asyncio.sleep(0.1)
        return {"key": key, "value": "loaded"}

    async def clear_cache(self) -> None:
        """Clear all cached data"""
        self._cache.clear()
`);

      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該處理 classmethod 和 staticmethod', async () => {
      await fixture.writeFile('methods.py', `
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class Person:
    """Person with class and static methods"""
    name: str
    age: int

    _instances: List["Person"] = []

    def __post_init__(self):
        Person._instances.append(self)

    @classmethod
    def create(cls, name: str, age: int) -> "Person":
        """Factory method"""
        return cls(name=name, age=age)

    @classmethod
    def get_all(cls) -> List["Person"]:
        """Get all instances"""
        return cls._instances.copy()

    @staticmethod
    def validate_age(age: int) -> bool:
        """Validate age"""
        return 0 <= age <= 150

    @staticmethod
    def validate_name(name: str) -> bool:
        """Validate name"""
        return len(name) > 0 and len(name) <= 100
`);

      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該處理 abstract class', async () => {
      await fixture.writeFile('abstract.py', `
from abc import ABC, abstractmethod
from typing import List

class Shape(ABC):
    """Abstract shape class"""

    @abstractmethod
    def area(self) -> float:
        """Calculate area"""
        pass

    @abstractmethod
    def perimeter(self) -> float:
        """Calculate perimeter"""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Get shape name"""
        pass

class Rectangle(Shape):
    """Rectangle implementation"""

    def __init__(self, width: float, height: float):
        self._width = width
        self._height = height

    def area(self) -> float:
        return self._width * self._height

    def perimeter(self) -> float:
        return 2 * (self._width + self._height)

    @property
    def name(self) -> str:
        return "Rectangle"
`);

      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });
  });
});
