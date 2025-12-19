/**
 * 測試相鄰行使用的案例
 * Bug: ±1 行容錯導致相鄰使用被誤排除
 */

// ❌ 非 DEADCODE: 方法定義在使用的下一行
export class WhitelistGuard {
  canActivate(): boolean {
    const clientIp = '127.0.0.1';
    return this.isIpAllowed(clientIp);  // 第 11 行：使用 isIpAllowed
  }
  isIpAllowed(clientIp: string): boolean {  // 第 13 行：定義（相鄰行）
    const whitelist = ['127.0.0.1', '::1'];
    return whitelist.includes(clientIp);
  }
}

// ❌ 非 DEADCODE: 函式定義緊接在使用之後
export function processRequest() {
  const data = validateInput('test');  // 第 21 行：使用
  return data;
}
function validateInput(input: string): string {  // 第 24 行：定義（相隔 2 行）
  return input.trim();
}

// ❌ 非 DEADCODE: 使用在定義的下一行
function createLogger() {  // 第 28 行：定義
  return { log: (msg: string) => console.log(msg) };
}
export const logger = createLogger();  // 第 31 行：使用（相隔 2 行）

// ❌ 非 DEADCODE: 連續定義，後者立即使用前者
function step1(): number {  // 第 34 行
  return 1;
}
function step2(): number {  // 第 37 行
  return step1() + 1;  // 使用 step1（相隔 2 行）
}
export function pipeline(): number {
  return step2();
}
