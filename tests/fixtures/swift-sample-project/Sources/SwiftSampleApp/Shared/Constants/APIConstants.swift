import Foundation

/// API 相關常數
enum APIConstants {
    /// 基礎 URL
    static let baseURL = "https://api.example.com"

    /// API 版本
    static let apiVersion = "v1"

    /// 完整的 API URL
    static var apiBaseURL: String {
        "\(baseURL)/\(apiVersion)"
    }

    /// 請求逾時時間（秒）
    static let requestTimeout: TimeInterval = 30

    /// 重試次數
    static let maxRetryCount = 3

    /// 重試延遲（秒）
    static let retryDelay: TimeInterval = 2

    /// API 端點
    enum Endpoint {
        /// 認證相關
        enum Auth {
            static let login = "/auth/login"
            static let logout = "/auth/logout"
            static let register = "/auth/register"
            static let refreshToken = "/auth/refresh"
            static let validateToken = "/auth/validate"
            static let resetPassword = "/auth/reset-password"
        }

        /// 使用者相關
        enum User {
            static let profile = "/user/profile"
            static let updateProfile = "/user/profile/update"
            static let changePassword = "/user/password/change"
            static let uploadAvatar = "/user/avatar/upload"
        }

        /// 產品相關
        enum Product {
            static let list = "/products"
            static func detail(id: String) -> String { "/products/\(id)" }
            static let search = "/products/search"
            static let categories = "/products/categories"
            static let featured = "/products/featured"
        }

        /// 訂單相關
        enum Order {
            static let list = "/orders"
            static func detail(id: String) -> String { "/orders/\(id)" }
            static let create = "/orders/create"
            static let cancel = "/orders/cancel"
            static let history = "/orders/history"
            static let status = "/orders/status"
        }

        /// 購物車相關
        enum Cart {
            static let items = "/cart/items"
            static let add = "/cart/add"
            static let remove = "/cart/remove"
            static let update = "/cart/update"
            static let clear = "/cart/clear"
            static let checkout = "/cart/checkout"
        }
    }

    /// HTTP Header Keys
    enum HeaderKey {
        static let authorization = "Authorization"
        static let contentType = "Content-Type"
        static let accept = "Accept"
        static let userAgent = "User-Agent"
        static let deviceId = "X-Device-ID"
        static let appVersion = "X-App-Version"
        static let platform = "X-Platform"
    }

    /// Content Type
    enum ContentType {
        static let json = "application/json"
        static let formUrlEncoded = "application/x-www-form-urlencoded"
        static let multipartFormData = "multipart/form-data"
    }

    /// HTTP Status Code
    enum StatusCode {
        static let success = 200
        static let created = 201
        static let noContent = 204
        static let badRequest = 400
        static let unauthorized = 401
        static let forbidden = 403
        static let notFound = 404
        static let internalServerError = 500
        static let serviceUnavailable = 503
    }
}
