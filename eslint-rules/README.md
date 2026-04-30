# ESLint 自定義規則

專案自定義 ESLint 規則，強制架構規範和最佳實踐。

## 規則列表

### [no-fs-in-core](./no-fs-in-core/README.md)

禁止 `src/core/**` 直接 import Node.js `fs` 模組，強制使用 `infrastructure/storage/FileSystem` 抽象層，確保可測試性和跨平台支援。

- 檢查範圍：`src/core/**/*.ts`
- 規則級別：`error`

### [no-default-instance-in-constructor](./no-default-instance-in-constructor/README.md)

禁止在 constructor 中實例化依賴（參數預設值和 body），強制外部依賴注入，提高可測試性和降低耦合。

- 檢查範圍：`**/*.ts`
- 規則級別：`error`

### [no-new-filesystem](./no-new-filesystem/README.md)

禁止直接 `new FileSystem()`，強制依賴注入。僅 `cli.ts`（composition root）例外。

- 檢查範圍：`**/*.ts`（`cli.ts` 除外）
- 規則級別：`error`

## 測試

```bash
pnpm lint                                                   # 執行所有檢查
pnpm lint 2>&1 | grep 'custom/no-fs-in-core'              # 檢查特定規則違規
```

## 新增規則

1. **建立資料夾**
   ```bash
   mkdir eslint-rules/rule-name
   touch eslint-rules/rule-name/index.js
   touch eslint-rules/rule-name/README.md
   ```

2. **實作規則**（`index.js`）
   ```javascript
   export default {
     meta: {
       type: 'problem',
       docs: { description: '規則描述' },
       messages: { messageId: '錯誤訊息' },
     },
     create(context) {
       return {
         Identifier(node) {
           if (/* 違規條件 */) {
             context.report({ node, messageId: 'messageId' });
           }
         },
       };
     },
   };
   ```

3. **註冊規則**（`eslint.config.js`）
   ```javascript
   import ruleName from './eslint-rules/rule-name/index.js';

   export default [{
     plugins: { 'custom': { rules: { 'rule-name': ruleName } } },
     rules: { 'custom/rule-name': 'error' },
   }];
   ```

4. **測試**：`pnpm lint`

## 資源

- [AST Explorer](https://astexplorer.net/)：線上 AST 查看工具
- [ESLint 官方文件](https://eslint.org/docs/latest/extend/custom-rules)：自定義規則開發指南
- [ESTree Spec](https://github.com/estree/estree)：JavaScript AST 規範
