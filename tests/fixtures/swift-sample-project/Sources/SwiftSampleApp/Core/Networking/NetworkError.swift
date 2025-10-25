import Foundation

/// 網路錯誤類型
enum NetworkError: LocalizedError {
    case invalidURL
    case noInternetConnection
    case requestTimeout
    case serverError(statusCode: Int)
    case decodingError(Error)
    case encodingError(Error)
    case unauthorized
    case forbidden
    case notFound
    case rateLimitExceeded
    case unknown(Error)

    /// 錯誤描述
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "無效的 URL"
        case .noInternetConnection:
            return "無法連接到網路，請檢查您的網路連接"
        case .requestTimeout:
            return "請求逾時，請稍後再試"
        case .serverError(let statusCode):
            return "伺服器錯誤（狀態碼：\(statusCode)）"
        case .decodingError(let error):
            return "資料解析錯誤：\(error.localizedDescription)"
        case .encodingError(let error):
            return "資料編碼錯誤：\(error.localizedDescription)"
        case .unauthorized:
            return "未授權，請重新登入"
        case .forbidden:
            return "拒絕存取，您沒有權限執行此操作"
        case .notFound:
            return "找不到請求的資源"
        case .rateLimitExceeded:
            return "請求次數過多，請稍後再試"
        case .unknown(let error):
            return "未知錯誤：\(error.localizedDescription)"
        }
    }

    /// 是否為可重試的錯誤
    var isRetryable: Bool {
        switch self {
        case .noInternetConnection, .requestTimeout, .serverError, .rateLimitExceeded:
            return true
        case .invalidURL, .decodingError, .encodingError, .unauthorized, .forbidden, .notFound, .unknown:
            return false
        }
    }

    /// 是否需要重新認證
    var requiresReauthentication: Bool {
        switch self {
        case .unauthorized:
            return true
        default:
            return false
        }
    }

    /// HTTP 狀態碼
    var statusCode: Int? {
        if case .serverError(let code) = self {
            return code
        }
        return nil
    }
}
