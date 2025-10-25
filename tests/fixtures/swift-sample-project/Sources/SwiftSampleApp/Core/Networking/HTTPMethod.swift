import Foundation

/// HTTP 請求方法
enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
    case head = "HEAD"
    case options = "OPTIONS"

    /// 是否需要 request body
    var requiresBody: Bool {
        switch self {
        case .post, .put, .patch:
            return true
        case .get, .delete, .head, .options:
            return false
        }
    }

    /// 是否為冪等操作
    var isIdempotent: Bool {
        switch self {
        case .get, .put, .delete, .head, .options:
            return true
        case .post, .patch:
            return false
        }
    }
}
