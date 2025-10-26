import Foundation

/// 應用程式配置
enum Config {
    /// 環境類型
    enum Environment {
        case development
        case staging
        case production

        /// 當前環境
        static var current: Environment {
            #if DEBUG
            return .development
            #else
            return .production
            #endif
        }
    }

    /// API 配置
    enum API {
        /// API 基礎 URL
        static var baseURL: String {
            switch Environment.current {
            case .development:
                return "https://dev-api.example.com"
            case .staging:
                return "https://staging-api.example.com"
            case .production:
                return "https://api.example.com"
            }
        }

        /// API 金鑰
        static var apiKey: String {
            switch Environment.current {
            case .development:
                return "dev_api_key_12345"
            case .staging:
                return "staging_api_key_67890"
            case .production:
                return "prod_api_key_abcde"
            }
        }
    }

    /// 功能開關
    enum Feature {
        /// 是否啟用分析追蹤
        static let analyticsEnabled: Bool = Environment.current == .production

        /// 是否啟用詳細日誌
        static let verboseLogging: Bool = Environment.current == .development

        /// 是否啟用實驗性功能
        static let experimentalFeaturesEnabled: Bool = Environment.current != .production

        /// 是否啟用離線模式
        static let offlineModeEnabled: Bool = true

        /// 是否啟用推播通知
        static let pushNotificationsEnabled: Bool = true
    }

    /// 快取配置
    enum Cache {
        /// 快取大小限制（MB）
        static let maxSize: Int = 100

        /// 快取過期時間（秒）
        static let expirationTime: TimeInterval = 3600

        /// 是否啟用快取
        static let enabled: Bool = true
    }
}
