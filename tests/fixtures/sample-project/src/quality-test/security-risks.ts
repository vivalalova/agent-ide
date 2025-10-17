/* eslint-disable no-undef */
/**
 * 安全風險測試檔案
 * 用於測試 SecurityChecker 的檢測能力
 */

// 測試項目 1：硬編碼密碼（應檢測到 3 個）
const password = 'admin123';
const dbPassword = 'secretPassword456';
const userPassword = 'P@ssw0rd';

// 測試項目 2：硬編碼 API Key（應檢測到 2 個）
const apiKey = 'sk-1234567890abcdef';
const secretKey = 'secret_key_xyz789';

// 測試項目 3：eval 使用（應檢測到 2 個）
function dangerousEval() {
  eval('console.log(\'dangerous\')');
  const code = '1 + 1';
  return eval(code);
}

// 測試項目 4：innerHTML 使用（應檢測到 1 個）
function unsafeHTML(content: string) {
  const element = document.createElement('div');
  element.innerHTML = content; // XSS 風險
  return element;
}

// 測試項目 5：console.log 包含敏感資訊（應檢測到 1 個）
function logSensitiveData(token: string) {
  console.log('User token:', token); // 不應該 log token
  return token;
}

// 正常的程式碼（不應被檢測為問題）
const normalConfig = {
  timeout: 5000,
  retries: 3,
};

function safeProcessing(data: string): string {
  return data.toUpperCase();
}

function safeHTML(content: string) {
  const element = document.createElement('div');
  element.textContent = content; // 安全的做法
  return element;
}

// 環境變數（正確做法，不應被檢測）
const envPassword = process.env.DB_PASSWORD;
const envApiKey = process.env.API_KEY;

export { dangerousEval, unsafeHTML, safeProcessing };
