/**
 * 引用 className 過濾策略
 *
 * TypeScript／JavaScript 兩側 reference-finder 在各自正規化出 refInfo
 * （kind/containerName/isMethodCall/isPropertyAccess/receiverType）後，
 * 用完全相同的規則判斷「該引用是否因不屬於目標類別而應被排除」。
 * 此策略與 AST library（ts.Node / Babel NodePath）無關，故抽成單一來源；
 * 語言側差異只在「巢狀函式自身作用域」例外分支需要的
 * hasEnclosingTargetFunction 判定——TS 用自家詞法作用域走訪、JS 用 Babel
 * scope binding，各自實作後以 thunk 傳入，避免共用模組依賴任一 AST library。
 */

/**
 * shouldExcludeByClassName 所需的引用分析結果最小欄位集合。
 * TS 側 IdentifierReferenceInfo 與 JS 側 ReferenceAnalysis 皆為此形狀的超集。
 */
export interface ClassNameFilterRefInfo {
  /** 容器名稱（類別、函式等） */
  containerName?: string;
  /**
   * 是否為屬性存取形（obj.method、obj.method()、this.method；不論是否被呼叫）。
   * 用於區分「屬性存取」與「裸識別符」兩種引用形狀——className 過濾對兩者採不同判定。
   */
  isPropertyAccess: boolean;
  /** Receiver 類型（用於區分不同類別的同名方法） */
  receiverType?: string;
}

/**
 * 判斷某引用是否因不屬於目標類別而應被排除。
 *
 * 依引用的「形狀」分流，而非依賴常常推不出的 receiver 型別：
 * - 目標類別內部（containerName === 目標類別）：保留（含方法定義本身、this.method）。
 * - 屬性存取形（obj.method / obj.method() / this.method）：
 *   - receiver 型別推不出（undefined）→ 保留（寧可誤報不可漏報；find-references 有
 *     --at 後置過濾、deadcode 少刪安全）。
 *   - receiver 型別即目標類別 → 保留。
 *   - receiver 型別等於所在類別（子類 this.method() 呼叫繼承自父類的方法）→ 保留。
 *   - receiver 型別確定為其他類別 → 排除。
 * - 裸識別符形（standalone，非屬性存取）：在目標類別外部即詞法綁定到別的符號 → 排除。
 *   例外：targetClassName === symbolName（呼叫端傳入的「容器名」其實就是符號本身，
 *   如巢狀函式以自身作為 scope 名稱的慣例）時，不代表存在別的同名符號互相排擠，
 *   此裸識別符本來就是目標符號的直接引用，不應被容器名不相符擋掉。
 *   但此例外仍須排除「其他 scope 內同名 local 綁定」造成的誤判（見 P2-5 bug：
 *   `const process = () => 2; process();` 這類與目標無關的區域變數重名，會被
 *   無條件保留誤算成目標引用）——只在該裸識別符所在的區塊鏈上，能找到一個
 *   同名的 FunctionDeclaration（巢狀函式慣例的宣告形式，具 hoisting 語意、
 *   於整個外層區塊皆可見）時才視為目標的直接引用；找不到則代表這只是另一個
 *   無關 scope 的同名綁定，交由一般裸識別符規則排除。
 *
 * @param hasEnclosingTargetFunction 語言側各自實作的判定：目標裸識別符所在區塊鏈上
 *   是否存在同名 FunctionDeclaration（TS 走詞法作用域鏈；JS 用 Babel scope binding）。
 *   僅在 `targetClassName === symbolName` 且非屬性存取的例外分支才會被呼叫，
 *   以 thunk 傳入維持原本的惰性求值。
 */
export function shouldExcludeByClassName(
  refInfo: ClassNameFilterRefInfo,
  targetClassName: string,
  symbolName: string,
  hasEnclosingTargetFunction: () => boolean
): boolean {
  // 巢狀函式以自身名稱作為 targetClassName 時，先做最近綁定判定；否則
  // containerName === targetClassName 的一般保留規則會在 scope 過濾前提前放行
  // 內層 const process 與其呼叫點。
  if (targetClassName === symbolName && !refInfo.isPropertyAccess) {
    return !hasEnclosingTargetFunction();
  }

  // 目標類別內部的引用一律保留（方法定義本身、類別內 this-less 引用等）
  if (refInfo.containerName === targetClassName) {
    return false;
  }

  if (refInfo.isPropertyAccess) {
    // 屬性存取形：靠 receiver 型別判定歸屬
    if (refInfo.receiverType === undefined) {
      return false;
    }
    if (refInfo.receiverType === targetClassName) {
      return false;
    }
    // this.method()：receiverType 等於所在類別（子類呼叫繼承自父類的方法）
    if (refInfo.receiverType === refInfo.containerName) {
      return false;
    }
    return true;
  }

  // 裸識別符形且在目標類別外部：綁定到別的符號，排除
  return true;
}
