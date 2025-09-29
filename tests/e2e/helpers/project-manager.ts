/**
 * 測試專案管理器
 * 負責建立、管理和清理各種測試專案範本
 */

import { mkdtemp, rm, writeFile, mkdir, access, readFile, cp } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { tmpdir } from 'os';
import { getTestWorkspace, reportMemoryUsage } from '../setup';

/**
 * 專案類型
 */
export enum ProjectType {
  TYPESCRIPT = 'typescript',
  JAVASCRIPT = 'javascript',
  SWIFT = 'swift',
  MIXED = 'mixed',
  LARGE = 'large',
  EMPTY = 'empty'
}

/**
 * 專案配置選項
 */
export interface ProjectOptions {
  name?: string;
  includeTests?: boolean;
  includeNodeModules?: boolean;
  fileCount?: number;
  complexity?: 'simple' | 'medium' | 'complex';
  dependencies?: Record<string, string>;
  customFiles?: { path: string; content: string }[];
}

/**
 * 專案資訊
 */
export interface ProjectInfo {
  id: string;
  type: ProjectType;
  path: string;
  name: string;
  fileCount: number;
  createdAt: Date;
  options: ProjectOptions;
}

/**
 * 測試專案管理器
 * 提供完整的測試專案生命週期管理
 */
export class ProjectManager {
  private projects: Map<string, ProjectInfo> = new Map();
  private testName: string = '';

  /**
   * 初始化專案管理器
   */
  constructor(testName?: string) {
    this.testName = testName || 'project-manager';
  }

  /**
   * 建立測試專案
   */
  async createProject(
    type: ProjectType,
    options: ProjectOptions = {}
  ): Promise<ProjectInfo> {
    const projectId = this.generateProjectId(type);
    const projectName = options.name || `test-${type}-${Date.now()}`;
    const projectPath = await mkdtemp(
      join(getTestWorkspace(), `${this.testName}-${projectId}-`)
    );

    const projectInfo: ProjectInfo = {
      id: projectId,
      type,
      path: projectPath,
      name: projectName,
      fileCount: 0,
      createdAt: new Date(),
      options
    };

    try {
      await this.generateProjectStructure(projectInfo);
      this.projects.set(projectId, projectInfo);

      reportMemoryUsage(`ProjectManager ${this.testName}: 建立 ${type} 專案`);

      return projectInfo;
    } catch (error) {
      // 建立失敗時清理
      await this.cleanupProject(projectPath);
      throw new Error(`建立 ${type} 專案失敗: ${error}`);
    }
  }

  /**
   * 複製現有專案範本
   */
  async createProjectFromTemplate(
    templatePath: string,
    options: ProjectOptions = {}
  ): Promise<ProjectInfo> {
    const templateName = basename(templatePath);
    const projectId = this.generateProjectId(ProjectType.MIXED, templateName);
    const projectPath = await mkdtemp(
      join(getTestWorkspace(), `${this.testName}-${projectId}-`)
    );

    try {
      // 檢查範本是否存在
      await access(templatePath);

      // 複製範本
      await cp(templatePath, projectPath, { recursive: true });

      // 應用客製化選項
      if (options.customFiles) {
        for (const customFile of options.customFiles) {
          const filePath = join(projectPath, customFile.path);
          const fileDir = dirname(filePath);
          await mkdir(fileDir, { recursive: true });
          await writeFile(filePath, customFile.content, 'utf-8');
        }
      }

      const projectInfo: ProjectInfo = {
        id: projectId,
        type: ProjectType.MIXED,
        path: projectPath,
        name: options.name || templateName,
        fileCount: await this.countFiles(projectPath),
        createdAt: new Date(),
        options
      };

      this.projects.set(projectId, projectInfo);

      reportMemoryUsage(`ProjectManager ${this.testName}: 複製範本 ${templateName}`);

      return projectInfo;
    } catch (error) {
      await this.cleanupProject(projectPath);
      throw new Error(`從範本建立專案失敗: ${error}`);
    }
  }

  /**
   * 獲取專案資訊
   */
  getProject(projectId: string): ProjectInfo | null {
    return this.projects.get(projectId) || null;
  }

  /**
   * 列出所有專案
   */
  listProjects(): ProjectInfo[] {
    return Array.from(this.projects.values());
  }

  /**
   * 修改專案檔案
   */
  async modifyFile(
    projectId: string,
    relativePath: string,
    content: string
  ): Promise<void> {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`專案不存在: ${projectId}`);
    }

    const filePath = join(project.path, relativePath);
    const fileDir = dirname(filePath);

    await mkdir(fileDir, { recursive: true });
    await writeFile(filePath, content, 'utf-8');
  }

  /**
   * 讀取專案檔案
   */
  async readFile(projectId: string, relativePath: string): Promise<string> {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`專案不存在: ${projectId}`);
    }

    const filePath = join(project.path, relativePath);
    return await readFile(filePath, 'utf-8');
  }

  /**
   * 複製專案到指定目錄 (E2E 測試使用的別名方法)
   */
  async copyProject(sourcePath: string, destinationPath: string): Promise<string> {
    try {
      // 檢查來源是否存在
      await access(sourcePath);

      // 確保目標目錄的父目錄存在
      await mkdir(dirname(destinationPath), { recursive: true });

      // 複製整個專案
      await cp(sourcePath, destinationPath, { recursive: true });

      reportMemoryUsage(`ProjectManager ${this.testName}: 複製專案 ${basename(sourcePath)}`);

      return destinationPath;
    } catch (error) {
      throw new Error(`複製專案失敗 (${sourcePath} -> ${destinationPath}): ${error}`);
    }
  }

  /**
   * 建立檔案 (兼容性方法)
   */
  async createFile(filePath: string, content: string): Promise<void> {
    const fileDir = dirname(filePath);
    await mkdir(fileDir, { recursive: true });
    await writeFile(filePath, content, 'utf-8');
  }

  /**
   * 讀取檔案 (兼容性方法 - 直接路徑版本)
   */
  async readFileDirectly(filePath: string): Promise<string> {
    return await readFile(filePath, 'utf-8');
  }

  /**
   * 清理目錄 (兼容性方法)
   */
  async cleanDirectory(dirPath: string): Promise<void> {
    try {
      await rm(dirPath, { recursive: true, force: true });
      await mkdir(dirPath, { recursive: true });
    } catch (error) {
      console.warn(`清理目錄失敗: ${dirPath} - ${error}`);
    }
  }

  /**
   * 清理單一專案
   */
  async cleanupProject(projectIdOrPath: string): Promise<void> {
    let projectPath: string;

    if (this.projects.has(projectIdOrPath)) {
      // 通過 ID 清理
      const project = this.projects.get(projectIdOrPath)!;
      projectPath = project.path;
      this.projects.delete(projectIdOrPath);
    } else {
      // 直接通過路徑清理
      projectPath = projectIdOrPath;
    }

    try {
      await rm(projectPath, { recursive: true, force: true });
    } catch (error) {
      console.warn(`清理專案失敗: ${projectPath} - ${error}`);
    }
  }

  /**
   * 清理所有專案
   */
  async cleanupAll(): Promise<void> {
    const cleanupPromises = Array.from(this.projects.keys()).map(
      projectId => this.cleanupProject(projectId)
    );

    await Promise.allSettled(cleanupPromises);
    this.projects.clear();
  }

  /**
   * 根據專案類型生成專案結構
   */
  private async generateProjectStructure(project: ProjectInfo): Promise<void> {
    const { type, path, options } = project;

    switch (type) {
    case ProjectType.TYPESCRIPT:
      await this.createTypeScriptProject(path, options);
      break;
    case ProjectType.JAVASCRIPT:
      await this.createJavaScriptProject(path, options);
      break;
    case ProjectType.SWIFT:
      await this.createSwiftProject(path, options);
      break;
    case ProjectType.MIXED:
      await this.createMixedProject(path, options);
      break;
    case ProjectType.LARGE:
      await this.createLargeProject(path, options);
      break;
    case ProjectType.EMPTY:
      await this.createEmptyProject(path, options);
      break;
    default:
      throw new Error(`不支援的專案類型: ${type}`);
    }

    project.fileCount = await this.countFiles(path);
  }

  /**
   * 建立 TypeScript 專案
   */
  private async createTypeScriptProject(
    projectPath: string,
    options: ProjectOptions
  ): Promise<void> {
    const complexity = options.complexity || 'medium';

    // 建立基本目錄結構
    await mkdir(join(projectPath, 'src'), { recursive: true });
    await mkdir(join(projectPath, 'src/utils'), { recursive: true });
    await mkdir(join(projectPath, 'src/types'), { recursive: true });

    if (options.includeTests) {
      await mkdir(join(projectPath, 'tests'), { recursive: true });
    }

    // package.json
    const packageJson = {
      name: options.name || 'test-typescript-project',
      version: '1.0.0',
      type: 'module',
      scripts: {
        build: 'tsc',
        test: 'vitest'
      },
      devDependencies: {
        typescript: '^5.0.0',
        '@types/node': '^20.0.0',
        ...(options.dependencies || {})
      }
    };
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify(packageJson, null, 2),
      'utf-8'
    );

    // tsconfig.json
    const tsConfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'node',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        declaration: true,
        outDir: './dist'
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist', 'tests']
    };
    await writeFile(
      join(projectPath, 'tsconfig.json'),
      JSON.stringify(tsConfig, null, 2),
      'utf-8'
    );

    // 生成程式碼檔案
    await this.generateTypeScriptFiles(projectPath, complexity);

    // 客製化檔案
    if (options.customFiles) {
      for (const customFile of options.customFiles) {
        const filePath = join(projectPath, customFile.path);
        const fileDir = dirname(filePath);
        await mkdir(fileDir, { recursive: true });
        await writeFile(filePath, customFile.content, 'utf-8');
      }
    }
  }

  /**
   * 生成 TypeScript 程式碼檔案
   */
  private async generateTypeScriptFiles(
    projectPath: string,
    complexity: 'simple' | 'medium' | 'complex'
  ): Promise<void> {
    // 主要入口檔案
    const indexContent = `/**
 * 主要入口點
 */

export { Calculator } from './utils/calculator.js';
export { UserManager } from './utils/user-manager.js';
export { Logger } from './utils/logger.js';
export type { User, CalculationResult } from './types/index.js';

// 全域配置
export const CONFIG = {
  version: '1.0.0',
  debug: process.env.NODE_ENV === 'development'
};

// 主要函式
export function greet(name: string): string {
  return \`Hello, \${name}! Welcome to our TypeScript project.\`;
}

export async function initialize(config?: Partial<typeof CONFIG>): Promise<void> {
  Object.assign(CONFIG, config);
  console.log('Application initialized with config:', CONFIG);
}`;

    await writeFile(join(projectPath, 'src/index.ts'), indexContent, 'utf-8');

    // 型別定義
    const typesContent = `/**
 * 應用程式型別定義
 */

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  preferences?: UserPreferences;
}

export type UserRole = 'admin' | 'user' | 'guest';

export interface UserPreferences {
  theme: 'light' | 'dark';
  language: string;
  notifications: boolean;
}

export interface CalculationResult {
  value: number;
  operation: string;
  operands: number[];
  timestamp: Date;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}`;

    await writeFile(join(projectPath, 'src/types/index.ts'), typesContent, 'utf-8');

    // 計算器工具
    const calculatorContent = `import type { CalculationResult } from '../types/index.js';

/**
 * 計算器工具類
 */
export class Calculator {
  private history: CalculationResult[] = [];

  /**
   * 加法運算
   */
  add(a: number, b: number): CalculationResult {
    const result: CalculationResult = {
      value: a + b,
      operation: 'addition',
      operands: [a, b],
      timestamp: new Date()
    };

    this.history.push(result);
    return result;
  }

  /**
   * 乘法運算
   */
  multiply(a: number, b: number): CalculationResult {
    const result: CalculationResult = {
      value: a * b,
      operation: 'multiplication',
      operands: [a, b],
      timestamp: new Date()
    };

    this.history.push(result);
    return result;
  }

  /**
   * 取得計算歷史
   */
  getHistory(): readonly CalculationResult[] {
    return [...this.history];
  }

  /**
   * 清除歷史
   */
  clearHistory(): void {
    this.history = [];
  }
}`;

    await writeFile(
      join(projectPath, 'src/utils/calculator.ts'),
      calculatorContent,
      'utf-8'
    );

    // 用戶管理器（複雜度較高時添加）
    if (complexity !== 'simple') {
      const userManagerContent = `import type { User, UserRole, UserPreferences } from '../types/index.js';

/**
 * 用戶管理器
 */
export class UserManager {
  private users: Map<number, User> = new Map();
  private nextId: number = 1;

  /**
   * 創建新用戶
   */
  createUser(
    name: string,
    email: string,
    role: UserRole = 'user',
    preferences?: UserPreferences
  ): User {
    const user: User = {
      id: this.nextId++,
      name,
      email,
      role,
      createdAt: new Date(),
      preferences
    };

    this.users.set(user.id, user);
    return user;
  }

  /**
   * 獲取用戶
   */
  getUser(id: number): User | null {
    return this.users.get(id) || null;
  }

  /**
   * 更新用戶
   */
  updateUser(id: number, updates: Partial<Omit<User, 'id' | 'createdAt'>>): User | null {
    const user = this.users.get(id);
    if (!user) return null;

    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  /**
   * 刪除用戶
   */
  deleteUser(id: number): boolean {
    return this.users.delete(id);
  }

  /**
   * 列出所有用戶
   */
  listUsers(role?: UserRole): User[] {
    const allUsers = Array.from(this.users.values());
    return role ? allUsers.filter(user => user.role === role) : allUsers;
  }

  /**
   * 搜尋用戶
   */
  searchUsers(query: string): User[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.users.values()).filter(
      user =>
        user.name.toLowerCase().includes(lowerQuery) ||
        user.email.toLowerCase().includes(lowerQuery)
    );
  }
}`;

      await writeFile(
        join(projectPath, 'src/utils/user-manager.ts'),
        userManagerContent,
        'utf-8'
      );
    }

    // 日誌工具（複雜度為 complex 時添加）
    if (complexity === 'complex') {
      const loggerContent = `import type { LogLevel, LogEntry } from '../types/index.js';

/**
 * 日誌工具類
 */
export class Logger {
  private entries: LogEntry[] = [];
  private level: LogLevel = 'info';

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  /**
   * 設定日誌級別
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Debug 日誌
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.log('debug', message, metadata);
  }

  /**
   * Info 日誌
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.log('info', message, metadata);
  }

  /**
   * Warn 日誌
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.log('warn', message, metadata);
  }

  /**
   * Error 日誌
   */
  error(message: string, metadata?: Record<string, any>): void {
    this.log('error', message, metadata);
  }

  /**
   * 通用日誌方法
   */
  private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      metadata
    };

    this.entries.push(entry);

    // 輸出到控制台
    const logMessage = \`[\${entry.timestamp.toISOString()}] \${level.toUpperCase()}: \${message}\`;
    console.log(logMessage);

    if (metadata) {
      console.log('Metadata:', metadata);
    }
  }

  /**
   * 檢查是否應該記錄此級別的日誌
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.level);
    const messageLevelIndex = levels.indexOf(level);

    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * 獲取日誌歷史
   */
  getEntries(level?: LogLevel): readonly LogEntry[] {
    if (level) {
      return this.entries.filter(entry => entry.level === level);
    }
    return [...this.entries];
  }

  /**
   * 清除日誌
   */
  clear(): void {
    this.entries = [];
  }
}`;

      await writeFile(
        join(projectPath, 'src/utils/logger.ts'),
        loggerContent,
        'utf-8'
      );
    }
  }

  /**
   * 建立 JavaScript 專案
   */
  private async createJavaScriptProject(
    projectPath: string,
    options: ProjectOptions
  ): Promise<void> {
    // 建立目錄結構
    await mkdir(join(projectPath, 'src'), { recursive: true });
    await mkdir(join(projectPath, 'lib'), { recursive: true });

    // package.json
    const packageJson = {
      name: options.name || 'test-javascript-project',
      version: '1.0.0',
      type: 'module',
      main: 'src/index.js',
      scripts: {
        start: 'node src/index.js',
        test: 'node --test'
      },
      dependencies: options.dependencies || {}
    };
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify(packageJson, null, 2),
      'utf-8'
    );

    // 主檔案
    const indexContent = `/**
 * JavaScript 專案主檔案
 */

import { Calculator } from './lib/calculator.js';
import { Utils } from './lib/utils.js';

// 匯出主要功能
export { Calculator, Utils };

// 主要函式
export function greet(name) {
  return \`Hello, \${name}! This is a JavaScript project.\`;
}

// 非同步初始化
export async function initialize(config = {}) {
  console.log('JavaScript project initialized:', config);
  return Promise.resolve();
}

// 如果直接執行此檔案
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  console.log(greet('World'));
  await initialize({ version: '1.0.0' });
}`;

    await writeFile(join(projectPath, 'src/index.js'), indexContent, 'utf-8');

    // 計算器庫
    const calculatorContent = `/**
 * JavaScript 計算器類
 */

export class Calculator {
  constructor() {
    this.history = [];
  }

  add(a, b) {
    const result = {
      value: a + b,
      operation: 'add',
      operands: [a, b],
      timestamp: new Date()
    };
    this.history.push(result);
    return result;
  }

  subtract(a, b) {
    const result = {
      value: a - b,
      operation: 'subtract',
      operands: [a, b],
      timestamp: new Date()
    };
    this.history.push(result);
    return result;
  }

  getHistory() {
    return [...this.history];
  }

  clearHistory() {
    this.history = [];
  }
}`;

    await writeFile(join(projectPath, 'lib/calculator.js'), calculatorContent, 'utf-8');

    // 工具庫
    const utilsContent = `/**
 * JavaScript 工具函式
 */

export class Utils {
  static formatNumber(num) {
    return num.toLocaleString();
  }

  static isEmail(email) {
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return emailRegex.test(email);
  }

  static capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static randomId() {
    return Math.random().toString(36).substring(2, 15);
  }
}`;

    await writeFile(join(projectPath, 'lib/utils.js'), utilsContent, 'utf-8');
  }

  /**
   * 建立 Swift 專案
   */
  private async createSwiftProject(
    projectPath: string,
    options: ProjectOptions
  ): Promise<void> {
    // 建立 Swift 專案結構
    await mkdir(join(projectPath, 'Sources'), { recursive: true });
    await mkdir(join(projectPath, 'Sources/TestApp'), { recursive: true });
    await mkdir(join(projectPath, 'Tests'), { recursive: true });
    await mkdir(join(projectPath, 'Tests/TestAppTests'), { recursive: true });

    // Package.swift
    const packageContent = `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "${options.name || 'TestApp'}",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "TestApp",
            targets: ["TestApp"]),
    ],
    dependencies: [],
    targets: [
        .target(
            name: "TestApp",
            dependencies: []),
        .testTarget(
            name: "TestAppTests",
            dependencies: ["TestApp"]),
    ]
)`;

    await writeFile(join(projectPath, 'Package.swift'), packageContent, 'utf-8');

    // 主要 Swift 檔案
    const mainContent = `import Foundation

/// 主要應用程式類
public class TestApp {
    public let name: String
    public let version: String

    public init(name: String = "TestApp", version: String = "1.0.0") {
        self.name = name
        self.version = version
    }

    /// 問候函式
    public func greet(_ name: String) -> String {
        return "Hello, \\(name)! Welcome to \\(self.name) v\\(version)."
    }

    /// 非同步初始化
    public func initialize() async throws {
        print("\\(name) initialized successfully")
    }
}

/// 計算器類
public class Calculator {
    private var history: [CalculationResult] = []

    public init() {}

    /// 加法運算
    public func add(_ a: Double, _ b: Double) -> CalculationResult {
        let result = CalculationResult(
            value: a + b,
            operation: .addition,
            operands: [a, b]
        )
        history.append(result)
        return result
    }

    /// 乘法運算
    public func multiply(_ a: Double, _ b: Double) -> CalculationResult {
        let result = CalculationResult(
            value: a * b,
            operation: .multiplication,
            operands: [a, b]
        )
        history.append(result)
        return result
    }

    /// 取得計算歷史
    public func getHistory() -> [CalculationResult] {
        return history
    }

    /// 清除歷史
    public func clearHistory() {
        history.removeAll()
    }
}

/// 計算結果結構
public struct CalculationResult {
    public let value: Double
    public let operation: Operation
    public let operands: [Double]
    public let timestamp: Date

    public init(value: Double, operation: Operation, operands: [Double]) {
        self.value = value
        self.operation = operation
        self.operands = operands
        self.timestamp = Date()
    }
}

/// 運算類型
public enum Operation {
    case addition
    case subtraction
    case multiplication
    case division
}`;

    await writeFile(
      join(projectPath, 'Sources/TestApp/TestApp.swift'),
      mainContent,
      'utf-8'
    );

    // 測試檔案
    if (options.includeTests) {
      const testContent = `import XCTest
@testable import TestApp

final class TestAppTests: XCTestCase {
    func testGreeting() {
        let app = TestApp()
        let greeting = app.greet("World")
        XCTAssertTrue(greeting.contains("Hello, World"))
    }

    func testCalculator() {
        let calculator = Calculator()
        let result = calculator.add(2, 3)
        XCTAssertEqual(result.value, 5)
        XCTAssertEqual(result.operation, .addition)
    }

    func testCalculatorHistory() {
        let calculator = Calculator()
        calculator.add(1, 2)
        calculator.multiply(3, 4)

        let history = calculator.getHistory()
        XCTAssertEqual(history.count, 2)

        calculator.clearHistory()
        XCTAssertEqual(calculator.getHistory().count, 0)
    }
}`;

      await writeFile(
        join(projectPath, 'Tests/TestAppTests/TestAppTests.swift'),
        testContent,
        'utf-8'
      );
    }
  }

  /**
   * 建立混合語言專案
   */
  private async createMixedProject(
    projectPath: string,
    options: ProjectOptions
  ): Promise<void> {
    // 建立複雜的目錄結構
    await mkdir(join(projectPath, 'frontend/src'), { recursive: true });
    await mkdir(join(projectPath, 'backend/src'), { recursive: true });
    await mkdir(join(projectPath, 'shared/types'), { recursive: true });

    // 根目錄 package.json
    const rootPackageJson = {
      name: options.name || 'test-mixed-project',
      version: '1.0.0',
      private: true,
      workspaces: ['frontend', 'backend', 'shared'],
      scripts: {
        'build:all': 'npm run build --workspaces',
        'test:all': 'npm run test --workspaces',
        'start:frontend': 'npm run start --workspace=frontend',
        'start:backend': 'npm run start --workspace=backend'
      }
    };
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify(rootPackageJson, null, 2),
      'utf-8'
    );

    // 前端 TypeScript
    await this.createFrontendStructure(join(projectPath, 'frontend'));

    // 後端 JavaScript
    await this.createBackendStructure(join(projectPath, 'backend'));

    // 共享型別定義
    await this.createSharedStructure(join(projectPath, 'shared'));
  }

  /**
   * 建立大型專案（用於效能測試）
   */
  private async createLargeProject(
    projectPath: string,
    options: ProjectOptions
  ): Promise<void> {
    const fileCount = options.fileCount || 100;
    const complexity = options.complexity || 'medium';

    // 建立大量檔案和目錄
    await mkdir(join(projectPath, 'src'), { recursive: true });

    for (let i = 0; i < fileCount; i++) {
      const moduleDir = join(projectPath, 'src', `module${i}`);
      await mkdir(moduleDir, { recursive: true });

      // 主檔案
      const mainContent = this.generateLargeFileContent(i, complexity);
      await writeFile(join(moduleDir, 'index.ts'), mainContent, 'utf-8');

      // 工具檔案
      const utilsContent = this.generateUtilsContent(i);
      await writeFile(join(moduleDir, 'utils.ts'), utilsContent, 'utf-8');

      // 型別檔案
      const typesContent = this.generateTypesContent(i);
      await writeFile(join(moduleDir, 'types.ts'), typesContent, 'utf-8');
    }

    // 主要入口檔案
    const indexContent = Array.from({ length: fileCount }, (_, i) =>
      `export * from './module${i}/index.js';`
    ).join('\n');
    await writeFile(join(projectPath, 'src/index.ts'), indexContent, 'utf-8');
  }

  /**
   * 建立空專案
   */
  private async createEmptyProject(
    projectPath: string,
    options: ProjectOptions
  ): Promise<void> {
    // 只建立基本的 package.json
    const packageJson = {
      name: options.name || 'test-empty-project',
      version: '1.0.0',
      description: 'Empty test project'
    };
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify(packageJson, null, 2),
      'utf-8'
    );

    // 如果需要，建立空目錄
    if (options.customFiles) {
      for (const customFile of options.customFiles) {
        const filePath = join(projectPath, customFile.path);
        const fileDir = dirname(filePath);
        await mkdir(fileDir, { recursive: true });
        await writeFile(filePath, customFile.content, 'utf-8');
      }
    }
  }

  /**
   * 工具方法：產生專案 ID
   */
  private generateProjectId(type: ProjectType, suffix?: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${type}-${timestamp}-${random}${suffix ? `-${suffix}` : ''}`;
  }

  /**
   * 工具方法：計算檔案數量
   */
  private async countFiles(dirPath: string): Promise<number> {
    try {
      const { readdir, stat } = await import('fs/promises');
      const items = await readdir(dirPath);
      let count = 0;

      for (const item of items) {
        const itemPath = join(dirPath, item);
        const stats = await stat(itemPath);

        if (stats.isFile()) {
          count++;
        } else if (stats.isDirectory()) {
          count += await this.countFiles(itemPath);
        }
      }

      return count;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 生成大型檔案內容
   */
  private generateLargeFileContent(index: number, complexity: string): string {
    const baseContent = `/**
 * Module ${index} - Generated for large project testing
 */

export class Module${index} {
  private id: number = ${index};
  private name: string = 'module-${index}';
  private data: Map<string, any> = new Map();

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    console.log(\`Initializing module \${this.id}\`);
  }

  public getData(key: string): any {
    return this.data.get(key);
  }

  public setData(key: string, value: any): void {
    this.data.set(key, value);
  }
}`;

    if (complexity === 'complex') {
      return baseContent + `\n\n// Additional complex methods for module ${index}\n` +
        Array.from({ length: 10 }, (_, i) => `
export function complexFunction${index}_${i}(param: any): any {
  return param ? { processed: true, index: ${index}, fn: ${i} } : null;
}`).join('\n');
    }

    return baseContent;
  }

  /**
   * 生成工具函式內容
   */
  private generateUtilsContent(index: number): string {
    return `/**
 * Utilities for Module ${index}
 */

export function formatValue${index}(value: any): string {
  return \`Module${index}: \${value}\`;
}

export function validate${index}(input: any): boolean {
  return input != null && typeof input === 'object';
}`;
  }

  /**
   * 生成型別定義內容
   */
  private generateTypesContent(index: number): string {
    return `/**
 * Types for Module ${index}
 */

export interface Module${index}Config {
  id: number;
  name: string;
  enabled: boolean;
}

export type Module${index}Status = 'idle' | 'running' | 'completed' | 'error';

export interface Module${index}Result {
  status: Module${index}Status;
  data?: any;
  error?: string;
}`;
  }

  /**
   * 建立前端結構
   */
  private async createFrontendStructure(frontendPath: string): Promise<void> {
    // 前端 package.json
    const packageJson = {
      name: 'frontend',
      version: '1.0.0',
      type: 'module',
      scripts: {
        build: 'tsc',
        start: 'node dist/index.js'
      },
      devDependencies: {
        typescript: '^5.0.0'
      }
    };
    await writeFile(
      join(frontendPath, 'package.json'),
      JSON.stringify(packageJson, null, 2),
      'utf-8'
    );

    // 前端主檔案
    const indexContent = `/**
 * Frontend Application Entry Point
 */

import { ApiClient } from './api-client.js';

export class FrontendApp {
  private apiClient: ApiClient;

  constructor() {
    this.apiClient = new ApiClient('http://localhost:3000');
  }

  async start(): Promise<void> {
    console.log('Frontend application starting...');
    // 初始化邏輯
  }
}

if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const app = new FrontendApp();
  app.start().catch(console.error);
}`;

    await writeFile(join(frontendPath, 'src/index.ts'), indexContent, 'utf-8');

    // API 客戶端
    const apiClientContent = `/**
 * API Client for communication with backend
 */

export class ApiClient {
  constructor(private baseUrl: string) {}

  async get(endpoint: string): Promise<any> {
    // Mock implementation
    return { data: 'mock response', endpoint };
  }

  async post(endpoint: string, data: any): Promise<any> {
    // Mock implementation
    return { success: true, data, endpoint };
  }
}`;

    await writeFile(join(frontendPath, 'src/api-client.ts'), apiClientContent, 'utf-8');
  }

  /**
   * 建立後端結構
   */
  private async createBackendStructure(backendPath: string): Promise<void> {
    // 後端 package.json
    const packageJson = {
      name: 'backend',
      version: '1.0.0',
      type: 'module',
      scripts: {
        start: 'node src/server.js'
      }
    };
    await writeFile(
      join(backendPath, 'package.json'),
      JSON.stringify(packageJson, null, 2),
      'utf-8'
    );

    // 後端伺服器
    const serverContent = `/**
 * Backend Server
 */

import { createServer } from 'http';
import { ApiHandler } from './api-handler.js';

export class BackendServer {
  constructor(port = 3000) {
    this.port = port;
    this.apiHandler = new ApiHandler();
  }

  start() {
    const server = createServer((req, res) => {
      this.apiHandler.handle(req, res);
    });

    server.listen(this.port, () => {
      console.log(\`Backend server running on port \${this.port}\`);
    });
  }
}

if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const server = new BackendServer();
  server.start();
}`;

    await writeFile(join(backendPath, 'src/server.js'), serverContent, 'utf-8');

    // API 處理器
    const apiHandlerContent = `/**
 * API Request Handler
 */

export class ApiHandler {
  handle(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'Hello from backend',
      method: req.method,
      url: req.url
    }));
  }
}`;

    await writeFile(join(backendPath, 'src/api-handler.js'), apiHandlerContent, 'utf-8');
  }

  /**
   * 建立共享結構
   */
  private async createSharedStructure(sharedPath: string): Promise<void> {
    // 共享 package.json
    const packageJson = {
      name: 'shared',
      version: '1.0.0',
      type: 'module',
      main: 'types/index.js',
      types: 'types/index.d.ts'
    };
    await writeFile(
      join(sharedPath, 'package.json'),
      JSON.stringify(packageJson, null, 2),
      'utf-8'
    );

    // 共享型別
    const typesContent = `/**
 * Shared Types for Frontend and Backend
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  owner: User;
  createdAt: Date;
}`;

    await writeFile(join(sharedPath, 'types/index.ts'), typesContent, 'utf-8');
  }
}