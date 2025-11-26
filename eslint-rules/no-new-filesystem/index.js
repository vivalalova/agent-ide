/**
 * ESLint 自定義規則：禁止直接實例化 FileSystem
 *
 * 禁止模式：new FileSystem()
 * 例外：cli.ts（作為根工廠入口點）
 *
 * 目的：強制依賴注入，所有 FileSystem 必須從外部注入
 */

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow direct FileSystem instantiation except in cli.ts',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      noNewFileSystem: 'Direct FileSystem instantiation is not allowed. Inject FileSystem from outside. Only cli.ts is allowed to create FileSystem instances.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();

    // 允許 cli.ts 作為根工廠
    if (filename.endsWith('cli.ts') || filename.endsWith('cli/cli.ts')) {
      return {};
    }

    return {
      NewExpression(node) {
        // 檢查是否為 new FileSystem()
        if (node.callee.type === 'Identifier' && node.callee.name === 'FileSystem') {
          context.report({
            node,
            messageId: 'noNewFileSystem',
          });
        }
      },
    };
  },
};
