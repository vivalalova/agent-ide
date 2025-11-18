# no-fs-in-core

## 規則說明

禁止 `src/core/**` 目錄下的檔案直接 import Node.js `fs` 模組，強制使用 `infrastructure/storage/FileSystem` 抽象層。

### 目的

確保 core 模組不直接依賴 Node.js 檔案系統 API，透過抽象層提高：
- **可測試性**：FileSystem 可輕鬆 mock
- **跨平台**：未來可支援不同檔案系統實作
- **架構清晰**：core 模組保持純業務邏輯

## 禁止的模式

```typescript
// ❌ 錯誤：直接 import fs
import * as fs from 'fs';
import * as fs from 'node:fs';
import * as fs from 'fs/promises';
import * as fs from 'node:fs/promises';
import { readFile, writeFile } from 'fs/promises';

// ❌ 錯誤：require fs
const fs = require('fs');
const { readFile } = require('fs/promises');
```

## 允許的模式

```typescript
// ✅ 正確：使用 FileSystem 抽象層
import { FileSystem } from '../../infrastructure/storage/file-system.js';

class MyService {
  constructor(private fileSystem: FileSystem) {}

  async readConfig(path: string): Promise<string> {
    return await this.fileSystem.readFile(path, 'utf-8');
  }
}
```

## 錯誤訊息

```
error  Direct import of 'fs/promises' is not allowed in src/core.
       Use FileSystem from 'infrastructure/storage' instead
       custom/no-fs-in-core
```

## 測試方法

```bash
# 測試單一檔案
npx eslint src/core/shit-score/shit-score-analyzer.ts

# 檢查所有違規
pnpm lint 2>&1 | grep 'custom/no-fs-in-core'

# 列出所有違規檔案
pnpm lint 2>&1 | grep -B 1 'custom/no-fs-in-core' | grep '\.ts$' | sort -u
```

## 實作細節

- **規則類型**：`problem`（錯誤級別）
- **檢查範圍**：僅 `src/core/**/*.ts` 檔案
- **禁止模組**：
  - `fs`
  - `node:fs`
  - `fs/promises`
  - `node:fs/promises`

## 修正指南

1. 找到違規的 import 語句
2. 移除 fs import
3. 在 constructor 加入 `FileSystem` 依賴
4. 使用 FileSystem API 替換 fs 操作

### 範例

```typescript
// Before
import { readFile } from 'fs/promises';

class MyService {
  async readConfig(path: string): Promise<string> {
    return await readFile(path, 'utf-8');
  }
}

// After
import { FileSystem } from '../../infrastructure/storage/file-system.js';

class MyService {
  constructor(private fileSystem: FileSystem) {}

  async readConfig(path: string): Promise<string> {
    return await this.fileSystem.readFile(path, 'utf-8');
  }
}
```
