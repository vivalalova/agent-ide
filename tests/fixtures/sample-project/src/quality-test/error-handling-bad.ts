/**
 * 錯誤處理問題測試檔案
 * 用於測試 ErrorHandlingChecker 的檢測能力
 */

// 測試項目 1：空 catch 區塊（應檢測到 3 個）
function riskyOperation1() {
  try {
    throw new Error('Something went wrong');
  } catch {}
}

function riskyOperation2() {
  try {
    JSON.parse('invalid json');
  } catch (error) {}
}

async function asyncOperation() {
  try {
    await Promise.reject('failed');
  } catch {}
}

// 測試項目 2：靜默吞錯（catch 有註解但無處理）（應檢測到 3 個）
function silentError1() {
  try {
    throw new Error('Error');
  } catch (e) {
    // ignore
  }
}

function silentError2() {
  try {
    doSomethingDangerous();
  } catch (err) {
    /* skip error */
  }
}

function silentError3() {
  try {
    riskyCall();
  } catch {
    // TODO: handle this later
  }
}

// 測試項目 3：有處理的 catch（正常，不應被檢測）
function goodErrorHandling1() {
  try {
    throw new Error('Error');
  } catch (error) {
    console.error('Error occurred:', error);
    throw error;
  }
}

function goodErrorHandling2() {
  try {
    riskyCall();
  } catch (error) {
    console.log('Handled error:', error);
    return null;
  }
}

// 輔助函式
function doSomethingDangerous(): void {
  throw new Error('Danger!');
}

function riskyCall(): void {
  throw new Error('Risky!');
}

export { riskyOperation1, riskyOperation2, asyncOperation };
