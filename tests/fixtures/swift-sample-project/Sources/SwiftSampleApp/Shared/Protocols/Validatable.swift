import Foundation

/// 可驗證協議
protocol Validatable {
    /// 驗證資料是否有效
    func validate() throws
}

/// 驗證錯誤
enum ValidationError: Error, LocalizedError {
    case emptyField(String)
    case invalidFormat(String)
    case outOfRange(String, min: Any, max: Any)
    case custom(String)

    var errorDescription: String? {
        switch self {
        case .emptyField(let field):
            return "\(field) 不能為空"
        case .invalidFormat(let field):
            return "\(field) 格式不正確"
        case .outOfRange(let field, let min, let max):
            return "\(field) 必須在 \(min) 到 \(max) 之間"
        case .custom(let message):
            return message
        }
    }
}
