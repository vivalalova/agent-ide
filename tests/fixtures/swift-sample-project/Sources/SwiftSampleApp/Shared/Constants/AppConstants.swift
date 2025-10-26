import Foundation

/// 應用程式常數
enum AppConstants {
    /// 應用程式名稱
    static let appName = "SwiftSampleApp"

    /// 應用程式版本
    static let appVersion = "1.0.0"

    /// Bundle ID
    static let bundleIdentifier = "com.example.swiftsampleapp"

    /// 支援的語言
    static let supportedLanguages = ["zh-TW", "en-US"]

    /// 預設語言
    static let defaultLanguage = "zh-TW"

    /// 時區
    static let timeZone = TimeZone(identifier: "Asia/Taipei")!

    /// 日期格式
    enum DateFormat {
        static let short = "yyyy-MM-dd"
        static let medium = "yyyy/MM/dd HH:mm"
        static let full = "yyyy-MM-dd HH:mm:ss"
        static let iso8601 = "yyyy-MM-dd'T'HH:mm:ssZ"
    }

    /// 檔案大小限制
    enum FileSizeLimit {
        static let avatar: Int64 = 5 * 1024 * 1024 // 5MB
        static let document: Int64 = 10 * 1024 * 1024 // 10MB
        static let image: Int64 = 2 * 1024 * 1024 // 2MB
    }

    /// 快取時間（秒）
    enum CacheTimeout {
        static let short = 300 // 5 分鐘
        static let medium = 1800 // 30 分鐘
        static let long = 3600 // 1 小時
        static let day = 86400 // 1 天
    }

    /// 分頁設定
    enum Pagination {
        static let defaultPageSize = 20
        static let maxPageSize = 100
    }

    /// UserDefaults Keys
    enum UserDefaultsKeys {
        static let isFirstLaunch = "isFirstLaunch"
        static let lastLoginDate = "lastLoginDate"
        static let userPreferences = "userPreferences"
        static let cachedUser = "cachedUser"
        static let deviceToken = "deviceToken"
    }

    /// Keychain Keys
    enum KeychainKeys {
        static let accessToken = "accessToken"
        static let refreshToken = "refreshToken"
        static let userPassword = "userPassword"
    }

    /// 通知名稱
    enum NotificationName {
        static let userDidLogin = Notification.Name("userDidLogin")
        static let userDidLogout = Notification.Name("userDidLogout")
        static let tokenDidExpire = Notification.Name("tokenDidExpire")
        static let dataDidUpdate = Notification.Name("dataDidUpdate")
    }
}
