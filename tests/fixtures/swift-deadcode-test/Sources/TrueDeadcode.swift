/// 這個文件包含真正的 deadcode（未使用的符號）
import Foundation

// MARK: - DEADCODE: 未使用的函式

/// 未使用的函式
func unusedFunction() -> String {
    return "This function is never called"
}

// MARK: - DEADCODE: 未使用的變數

/// 未使用的變數
let unusedVariable = "This variable is never referenced"

// MARK: - DEADCODE: 未使用的類別

/// 未使用的類別
class UnusedClass {
    private var data: String

    init(data: String) {
        self.data = data
    }

    func getData() -> String {
        return data
    }
}

// MARK: - DEADCODE: 未使用的常數

/// 未使用的常數
let UNUSED_CONSTANT = 42

// MARK: - DEADCODE: 未使用的結構體

/// 未使用的結構體
struct UnusedStruct {
    var value: Int

    func getValue() -> Int {
        return value
    }
}

// MARK: - DEADCODE: 未使用的列舉

/// 未使用的列舉
enum UnusedEnum {
    case optionA
    case optionB
    case optionC
}

// MARK: - DEADCODE: 未使用的協議

/// 未使用的協議
protocol UnusedProtocol {
    func doSomething()
}

// MARK: - DEADCODE: 未使用的內部類別

/// 未使用的內部類別
class UnusedInternalClass {
    static func helper() -> String {
        return "helper"
    }
}

// MARK: - 非 DEADCODE: 已使用的函式

/// 已使用的函式
func usedFunction() -> String {
    return "This function is used"
}

/// 內部使用的輔助函式
func internalHelper() -> String {
    return "helper"
}

/// 公開函式，使用 internalHelper
func publicFunction() -> String {
    return internalHelper()
}

// 使用 usedFunction 和 publicFunction
let _ = usedFunction()
let _ = publicFunction()
