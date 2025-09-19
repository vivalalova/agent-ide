# CLI 介面模組開發規範

## 模組職責
提供直觀、高效的命令列介面，讓開發者和 AI Agent 能夠透過 CLI 使用所有核心功能，支援互動式和批次處理模式。

## 開發原則

### 1. 使用者體驗
- **直觀命令**：命令結構清晰、易記
- **豐富回饋**：進度顯示、結果格式化
- **錯誤友善**：清楚的錯誤訊息和建議
- **效能優先**：快速響應、最小延遲

### 2. 命令設計
- 遵循 Unix 哲學
- 支援管道和重定向
- 提供簡寫和完整選項
- 保持一致的命令結構

### 3. 輸出格式
- 人類可讀的預設輸出
- 機器可解析的 JSON 格式
- 最小化 token 使用
- 支援靜默模式

## 實作規範

### 檔案結構
```
cli/
├── index.ts                 # CLI 入口
├── cli.ts                   # 主程式
├── commands/
│   ├── index-command.ts         # 索引命令
│   ├── rename-command.ts        # 重命名命令
│   ├── move-command.ts          # 移動命令
│   ├── search-command.ts        # 搜尋命令
│   ├── analyze-command.ts       # 分析命令
│   ├── refactor-command.ts      # 重構命令
│   ├── dependency-command.ts    # 依賴命令
│   └── config-command.ts        # 設定命令
├── options/
│   ├── global-options.ts        # 全域選項
│   ├── format-options.ts        # 格式選項
│   └── filter-options.ts        # 過濾選項
├── formatters/
│   ├── json-formatter.ts        # JSON 輸出
│   ├── table-formatter.ts       # 表格輸出
│   ├── tree-formatter.ts        # 樹狀輸出
│   └── minimal-formatter.ts     # 最小輸出
├── interactive/
│   ├── prompt-manager.ts        # 提示管理
│   ├── progress-bar.ts          # 進度條
│   └── autocomplete.ts          # 自動完成
└── types.ts                 # 型別定義
```

## 命令實作

### 基礎命令結構
```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

abstract class BaseCommand {
  protected program: Command;
  protected spinner: ora.Ora;
  
  constructor(name: string, description: string) {
    this.program = new Command(name);
    this.program.description(description);
    this.setupOptions();
    this.setupAction();
  }
  
  // 設定選項
  protected abstract setupOptions(): void;
  
  // 設定動作
  protected abstract setupAction(): void;
  
  // 執行命令
  protected abstract execute(options: any): Promise<void>;
  
  // 輸出結果
  protected output(data: any, options: OutputOptions): void {
    const formatter = this.getFormatter(options.format);
    const formatted = formatter.format(data);
    
    if (options.minimal) {
      console.log(this.minimizeOutput(formatted));
    } else {
      console.log(formatted);
    }
  }
  
  // 錯誤處理
  protected handleError(error: Error): void {
    this.spinner?.fail();
    console.error(chalk.red('✖'), error.message);
    
    if (this.program.opts().verbose) {
      console.error(chalk.gray(error.stack));
    }
    
    process.exit(1);
  }
}
```

### 索引命令
```typescript
class IndexCommand extends BaseCommand {
  constructor() {
    super('index', 'Build or update code index');
  }
  
  protected setupOptions(): void {
    this.program
      .argument('[paths...]', 'Paths to index', '.')
      .option('-f, --force', 'Force rebuild index')
      .option('-i, --incremental', 'Incremental update')
      .option('--include <patterns>', 'Include patterns', '**/*.{ts,js,tsx,jsx,swift}')
      .option('--exclude <patterns>', 'Exclude patterns', '**/node_modules/**')
      .option('--max-depth <depth>', 'Maximum directory depth', '10')
      .option('--format <format>', 'Output format', 'json')
      .option('--stats', 'Show indexing statistics');
  }
  
  protected setupAction(): void {
    this.program.action(async (paths, options) => {
      await this.execute({ paths, ...options });
    });
  }
  
  protected async execute(options: IndexOptions): Promise<void> {
    this.spinner = ora('Indexing files...').start();
    
    try {
      // 呼叫索引服務
      const indexService = new IndexingService();
      const result = await indexService.index({
        paths: options.paths,
        force: options.force,
        incremental: options.incremental,
        include: options.include,
        exclude: options.exclude,
        maxDepth: options.maxDepth
      });
      
      this.spinner.succeed(`Indexed ${result.filesIndexed} files`);
      
      if (options.stats) {
        this.outputStats(result);
      }
      
      this.output(result, { format: options.format });
    } catch (error) {
      this.handleError(error);
    }
  }
  
  private outputStats(result: IndexResult): void {
    console.log(chalk.cyan('\nIndexing Statistics:'));
    console.log(`  Files indexed: ${chalk.green(result.filesIndexed)}`);
    console.log(`  Symbols found: ${chalk.green(result.symbolsFound)}`);
    console.log(`  Index size: ${chalk.green(this.formatBytes(result.indexSize))}`);
    console.log(`  Time taken: ${chalk.green(result.timeTaken + 'ms')}`);
    console.log(`  Memory used: ${chalk.green(this.formatBytes(result.memoryUsed))}`);
  }
}
```

### 重命名命令
```typescript
class RenameCommand extends BaseCommand {
  constructor() {
    super('rename', 'Rename symbols with reference updates');
  }
  
  protected setupOptions(): void {
    this.program
      .argument('<old-name>', 'Current name')
      .argument('<new-name>', 'New name')
      .option('-t, --type <type>', 'Symbol type', 'all')
      .option('-s, --scope <path>', 'Limit to scope')
      .option('--dry-run', 'Preview changes without applying')
      .option('--interactive', 'Interactive mode')
      .option('--format <format>', 'Output format', 'diff');
  }
  
  protected async execute(options: RenameOptions): Promise<void> {
    const renameService = new RenameService();
    
    // 尋找符號
    this.spinner = ora('Finding symbol...').start();
    const symbols = await renameService.findSymbol(options.oldName, {
      type: options.type,
      scope: options.scope
    });
    
    if (symbols.length === 0) {
      this.spinner.fail('Symbol not found');
      return;
    }
    
    this.spinner.text = 'Analyzing references...';
    
    // 分析影響
    const impact = await renameService.analyzeImpact(symbols[0], options.newName);
    
    // 互動式確認
    if (options.interactive) {
      const confirmed = await this.confirmChanges(impact);
      if (!confirmed) {
        this.spinner.info('Rename cancelled');
        return;
      }
    }
    
    // 執行重命名
    if (!options.dryRun) {
      this.spinner.text = 'Applying changes...';
      await renameService.rename(symbols[0], options.newName);
      this.spinner.succeed(`Renamed ${impact.files.length} files`);
    } else {
      this.spinner.info('Dry run - no changes applied');
    }
    
    // 輸出結果
    this.outputChanges(impact, options.format);
  }
}
```

### 搜尋命令
```typescript
class SearchCommand extends BaseCommand {
  constructor() {
    super('search', 'Search code with multiple strategies');
  }
  
  protected setupOptions(): void {
    this.program
      .argument('<query>', 'Search query')
      .option('-t, --type <type>', 'Search type', 'text')
      .option('-l, --language <lang>', 'Language filter')
      .option('-p, --path <path>', 'Path filter')
      .option('-c, --case-sensitive', 'Case sensitive search')
      .option('-r, --regex', 'Use regex')
      .option('-w, --whole-word', 'Match whole words')
      .option('-m, --max-results <n>', 'Maximum results', '50')
      .option('--context <lines>', 'Context lines', '2')
      .option('--format <format>', 'Output format', 'list')
      .option('--minimal', 'Minimal output for AI agents');
  }
  
  protected async execute(options: SearchOptions): Promise<void> {
    const searchService = new SearchService();
    
    // 建構查詢
    const query = this.buildQuery(options);
    
    // 執行搜尋
    this.spinner = ora('Searching...').start();
    const results = await searchService.search(query);
    
    this.spinner.succeed(`Found ${results.length} results`);
    
    // 格式化輸出
    if (options.minimal) {
      this.outputMinimal(results);
    } else {
      this.outputResults(results, options);
    }
  }
  
  private outputMinimal(results: SearchResult[]): void {
    // 最小化輸出給 AI Agent
    results.forEach(result => {
      console.log(`${result.file}:${result.line}:${result.match}`);
    });
  }
  
  private outputResults(results: SearchResult[], options: SearchOptions): void {
    results.forEach(result => {
      console.log(chalk.cyan(`${result.file}:${result.line}`));
      
      if (options.context > 0) {
        this.outputContext(result, options.context);
      } else {
        console.log(`  ${this.highlightMatch(result.text, result.match)}`);
      }
    });
  }
}
```

## 輸出格式化

### JSON 格式化器
```typescript
class JSONFormatter implements Formatter {
  format(data: any, options?: JSONFormatOptions): string {
    if (options?.minimal) {
      // 最小化 JSON 給 AI Agent
      return JSON.stringify(data);
    }
    
    if (options?.pretty) {
      return JSON.stringify(data, null, 2);
    }
    
    // 優化的 JSON 輸出
    return this.optimizeJSON(data);
  }
  
  private optimizeJSON(data: any): string {
    // 移除空值和預設值
    const cleaned = this.removeDefaults(data);
    
    // 壓縮重複結構
    const compressed = this.compressStructure(cleaned);
    
    return JSON.stringify(compressed);
  }
}
```

### 表格格式化器
```typescript
class TableFormatter implements Formatter {
  format(data: any[], options?: TableFormatOptions): string {
    const table = new Table({
      head: options?.headers || this.inferHeaders(data),
      style: {
        head: ['cyan'],
        border: ['gray']
      },
      ...(options?.compact && {
        chars: {
          'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
          'bottom': '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
          'left': '', 'left-mid': '', 'mid': '', 'mid-mid': '',
          'right': '', 'right-mid': '', 'middle': ' '
        }
      })
    });
    
    data.forEach(item => {
      table.push(this.extractRow(item, options));
    });
    
    return table.toString();
  }
}
```

## 互動模式

### 提示管理器
```typescript
class PromptManager {
  // 確認提示
  async confirm(message: string, defaultValue = false): Promise<boolean> {
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue
    }]);
    
    return confirmed;
  }
  
  // 選擇提示
  async select(message: string, choices: Choice[]): Promise<string> {
    const { selected } = await inquirer.prompt([{
      type: 'list',
      name: 'selected',
      message,
      choices
    }]);
    
    return selected;
  }
  
  // 多選提示
  async multiSelect(message: string, choices: Choice[]): Promise<string[]> {
    const { selected } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selected',
      message,
      choices
    }]);
    
    return selected;
  }
  
  // 輸入提示
  async input(message: string, options?: InputOptions): Promise<string> {
    const { value } = await inquirer.prompt([{
      type: 'input',
      name: 'value',
      message,
      default: options?.default,
      validate: options?.validate,
      filter: options?.filter
    }]);
    
    return value;
  }
}
```

### 進度顯示
```typescript
class ProgressManager {
  private progressBar: cliProgress.SingleBar;
  
  // 建立進度條
  create(total: number, options?: ProgressOptions): void {
    this.progressBar = new cliProgress.SingleBar({
      format: options?.format || '{bar} {percentage}% | {value}/{total} | {duration}s | {eta}s',
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true
    }, cliProgress.Presets.shades_classic);
    
    this.progressBar.start(total, 0);
  }
  
  // 更新進度
  update(value: number, payload?: any): void {
    this.progressBar.update(value, payload);
  }
  
  // 完成進度
  complete(): void {
    this.progressBar.stop();
  }
}
```

## 配置管理

### 配置命令
```typescript
class ConfigCommand extends BaseCommand {
  constructor() {
    super('config', 'Manage CLI configuration');
  }
  
  protected setupOptions(): void {
    this.program
      .addCommand(this.createGetCommand())
      .addCommand(this.createSetCommand())
      .addCommand(this.createListCommand())
      .addCommand(this.createResetCommand());
  }
  
  private createSetCommand(): Command {
    const cmd = new Command('set');
    cmd
      .argument('<key>', 'Configuration key')
      .argument('<value>', 'Configuration value')
      .action(async (key, value) => {
        const config = await this.loadConfig();
        config.set(key, value);
        await config.save();
        console.log(chalk.green('✓'), `Set ${key} = ${value}`);
      });
    
    return cmd;
  }
}
```

### 配置結構
```typescript
interface CLIConfig {
  // 輸出設定
  output: {
    format: 'json' | 'table' | 'tree' | 'minimal';
    color: boolean;
    verbose: boolean;
    quiet: boolean;
  };
  
  // 預設值
  defaults: {
    language: string;
    maxResults: number;
    contextLines: number;
    includePatterns: string[];
    excludePatterns: string[];
  };
  
  // 效能設定
  performance: {
    parallel: boolean;
    workers: number;
    cacheEnabled: boolean;
    cacheSize: number;
  };
  
  // AI Agent 優化
  agent: {
    minimalOutput: boolean;
    tokenLimit: number;
    streamingEnabled: boolean;
  };
}
```

## 錯誤處理

### 錯誤處理器
```typescript
class ErrorHandler {
  handle(error: Error): void {
    if (error instanceof ValidationError) {
      this.handleValidationError(error);
    } else if (error instanceof NotFoundError) {
      this.handleNotFoundError(error);
    } else if (error instanceof PermissionError) {
      this.handlePermissionError(error);
    } else {
      this.handleUnknownError(error);
    }
  }
  
  private handleValidationError(error: ValidationError): void {
    console.error(chalk.red('✖ Validation Error:'), error.message);
    
    if (error.field) {
      console.error(chalk.yellow('  Field:'), error.field);
    }
    
    if (error.suggestion) {
      console.error(chalk.cyan('  Suggestion:'), error.suggestion);
    }
    
    process.exit(1);
  }
}
```

## 測試支援

### CLI 測試工具
```typescript
class CLITestHelper {
  // 執行命令測試
  async runCommand(args: string[]): Promise<CommandResult> {
    const output: string[] = [];
    const errors: string[] = [];
    
    // 攔截輸出
    const originalLog = console.log;
    const originalError = console.error;
    
    console.log = (...args) => output.push(args.join(' '));
    console.error = (...args) => errors.push(args.join(' '));
    
    try {
      // 執行命令
      await cli.parse(args);
      
      return {
        success: true,
        output: output.join('\n'),
        errors: errors.join('\n')
      };
    } catch (error) {
      return {
        success: false,
        output: output.join('\n'),
        errors: errors.join('\n'),
        error
      };
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  }
}
```

## 開發檢查清單

### 功能完整性
- [ ] 所有核心功能命令實作
- [ ] 完整的選項支援
- [ ] 多種輸出格式
- [ ] 互動模式支援
- [ ] 批次處理支援

### 使用者體驗
- [ ] 清晰的錯誤訊息
- [ ] 進度顯示
- [ ] 自動完成
- [ ] 命令別名
- [ ] 幫助文檔完整

### AI Agent 優化
- [ ] 最小化輸出模式
- [ ] JSON 結構化輸出
- [ ] Token 使用優化
- [ ] 串流輸出支援

## 疑難排解

### 常見問題

1. **命令執行緩慢**
   - 啟用並行處理
   - 使用增量更新
   - 優化查詢條件

2. **輸出過於冗長**
   - 使用 --minimal 選項
   - 調整 --max-results
   - 使用過濾選項

3. **記憶體使用過高**
   - 限制結果數量
   - 使用串流處理
   - 啟用分頁

## 未來改進
1. 智能命令建議
2. 命令歷史和重播
3. 自訂命令腳本
4. 遠端執行支援