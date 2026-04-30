# no-default-instance-in-constructor

## 規則說明

禁止在 constructor 中實例化依賴（參數預設值和 body），強制外部依賴注入。

### 目的

確保所有依賴從外部注入，提高：
- **可測試性**：單元測試可輕鬆 mock 依賴
- **解耦**：類別不依賴具體實作
- **彈性**：依賴可在執行時替換

## 禁止的模式

### 1. 參數預設值實例化

```typescript
// ❌ 錯誤：參數預設值實例化
class Service {
  constructor(
    private fileSystem: FileSystem = new FileSystem()  // 違規
  ) {}
}

class Service {
  constructor(
    fileSystem: FileSystem = new FileSystem(),  // 違規
    private cache: Cache = new Cache()  // 違規
  ) {}
}
```

### 2. Body 實例化 - Nullish Coalescing (`??`)

```typescript
// ❌ 錯誤：body 中使用 ??
class Service {
  constructor(fileSystem?: FileSystem) {
    this.fileSystem = fileSystem ?? new FileSystem();  // 違規
  }
}
```

### 3. Body 實例化 - Logical OR (`||`)

```typescript
// ❌ 錯誤：body 中使用 ||
class Service {
  constructor(cache?: Cache) {
    this.cache = cache || new Cache();  // 違規
  }
}
```

### 4. Body 實例化 - 三元運算子

```typescript
// ❌ 錯誤：body 中使用三元運算子
class Service {
  constructor(logger?: Logger) {
    this.logger = logger ? logger : new Logger();  // 違規
  }
}
```

## 允許的模式

### 1. 強制依賴注入

```typescript
// ✅ 正確：必須參數，強制外部注入
class Service {
  constructor(
    private fileSystem: FileSystem  // 正確
  ) {}
}
```

### 2. Primitive 預設值

```typescript
// ✅ 允許：primitive 預設值
class Service {
  constructor(
    private timeout: number = 5000,  // OK：primitive
    private enabled: boolean = true  // OK：primitive
  ) {}
}
```

### 3. 非依賴的內部工具

```typescript
// ✅ 允許：非依賴的內部工具實例化
class Service {
  constructor(fileSystem: FileSystem) {
    this.fileSystem = fileSystem;
    this.cache = new Map();  // OK：不是參數依賴
    this.listeners = new Set();  // OK：內部資料結構
  }
}
```

## 錯誤訊息

```
error  Default instance creation in constructor is not allowed.
       Use strict dependency injection: Remove optional parameter and pass instance from outside
       custom/no-default-instance-in-constructor

error  Instance creation in constructor body is not allowed.
       Use strict dependency injection: Remove optional parameter and pass instance from outside
       custom/no-default-instance-in-constructor
```

## 測試方法

```bash
# 測試單一檔案
npx eslint src/infrastructure/cache/cache-manager.ts

# 檢查所有違規
pnpm lint 2>&1 | grep 'no-default-instance-in-constructor'

# 列出所有違規檔案
pnpm lint 2>&1 | grep -B 1 'no-default-instance-in-constructor' | grep '\.ts:' | sort -u
```

## 實作細節

- **規則類型**：`problem`（錯誤級別）
- **檢查範圍**：所有 `**/*.ts` 檔案
- **偵測模式**：
  1. Constructor 參數預設值為 `new ClassName()`
  2. Constructor body 中使用 `param ?? new ClassName()`
  3. Constructor body 中使用 `param || new ClassName()`
  4. Constructor body 中使用 `param ? param : new ClassName()`

## 修正指南

### 步驟

1. 移除參數預設值
2. 將參數從 optional (`?`) 改為必須
3. 在呼叫端建立實例並傳入

### 範例

```typescript
// Before
class Service {
  constructor(
    private fileSystem: FileSystem = new FileSystem()
  ) {}
}

// 呼叫
const service = new Service();

// After
class Service {
  constructor(
    private fileSystem: FileSystem  // 移除預設值，改為必須
  ) {}
}

// 呼叫（在外部建立實例）
const service = new Service(new FileSystem());
```

### Body 實例化範例

```typescript
// Before
class Service {
  private fileSystem: FileSystem;

  constructor(fileSystem?: FileSystem) {
    this.fileSystem = fileSystem ?? new FileSystem();
  }
}

// After
class Service {
  constructor(
    private fileSystem: FileSystem  // 直接必須參數
  ) {}
}
```

## 檢查清單

- [ ] 移除 constructor 參數預設值中的 `new ClassName()`
- [ ] 移除 constructor body 中的 `?? new ClassName()`
- [ ] 移除 constructor body 中的 `|| new ClassName()`
- [ ] 移除 constructor body 中的三元運算子實例化
- [ ] 將 optional 參數改為必須參數
- [ ] 在呼叫端傳入實例
