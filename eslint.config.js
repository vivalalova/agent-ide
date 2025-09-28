import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';

export default [
  eslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        // Node.js 全域變數
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        NodeJS: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        performance: 'readonly',
        BufferEncoding: 'readonly',
        FileSystem: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript 特定規則 - 調整為警告以便漸進式修復
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // 一般規則
      'no-console': 'off', // 在開發工具中允許 console
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': 'off', // 由 TypeScript 規則處理
      'no-undef': 'error',

      // 程式碼風格
      'eqeqeq': 'warn', // 調整為警告
      'curly': 'error',
      'no-trailing-spaces': 'warn',
      'semi': ['warn', 'always'],
      'quotes': ['warn', 'single'],
      'indent': 'off', // 關閉縮排檢查避免大量格式問題
      'no-useless-escape': 'warn',
      'no-case-declarations': 'warn', // case 區塊中的詞法宣告調整為警告
      'no-useless-catch': 'warn', // 無用 catch 調整為警告
      'no-redeclare': 'warn', // 重複宣告調整為警告
      'no-control-regex': 'warn', // 控制字元正則表達式調整為警告
    },
  },
  {
    // 忽略特定檔案
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '*.config.js',
      '*.config.ts',
    ],
  },
];