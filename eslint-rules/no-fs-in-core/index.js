/**
 * ESLint 自定義規則：禁止在 src/core 目錄下直接 import Node.js fs 模組
 *
 * 目的：強制使用 infrastructure/storage/FileSystem 抽象層，
 * 確保 core 模組不直接依賴 Node.js 檔案系統 API
 */

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow direct import of Node.js fs module in src/core',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      noFsImport: 'Direct import of \'{{ module }}\' is not allowed in src/core. Use FileSystem from \'infrastructure/storage\' instead.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename || context.getFilename();

    // 只檢查 src/core 目錄下的檔案
    if (!filename.includes('/src/core/')) {
      return {};
    }

    // 禁止的模組列表
    const forbiddenModules = [
      'fs',
      'node:fs',
      'fs/promises',
      'node:fs/promises',
    ];

    return {
      // 檢查 import 語句
      ImportDeclaration(node) {
        const importSource = node.source.value;
        if (forbiddenModules.includes(importSource)) {
          context.report({
            node,
            messageId: 'noFsImport',
            data: {
              module: importSource,
            },
          });
        }
      },

      // 檢查 require() 調用
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length > 0 &&
          node.arguments[0].type === 'Literal'
        ) {
          const moduleName = node.arguments[0].value;
          if (forbiddenModules.includes(moduleName)) {
            context.report({
              node,
              messageId: 'noFsImport',
              data: {
                module: moduleName,
              },
            });
          }
        }
      },
    };
  },
};
