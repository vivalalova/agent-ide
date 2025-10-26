import Foundation

/// 使用者個人檔案
struct UserProfile: Codable {
    /// 使用者 ID
    let userId: String

    /// 姓名
    var fullName: String

    /// 暱稱
    var nickname: String?

    /// 生日
    var birthDate: Date?

    /// 性別
    var gender: Gender?

    /// 電話
    var phone: String?

    /// 地址列表
    var addresses: [Address]

    /// 偏好設定
    var preferences: UserPreferences

    /// 年齡
    var age: Int? {
        guard let birthDate = birthDate else { return nil }
        let calendar = Calendar.current
        let ageComponents = calendar.dateComponents([.year], from: birthDate, to: Date())
        return ageComponents.year
    }

    /// CodingKeys for JSON mapping
    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case fullName = "full_name"
        case nickname
        case birthDate = "birth_date"
        case gender
        case phone
        case addresses
        case preferences
    }
}

/// 性別
enum Gender: String, Codable {
    case male = "male"
    case female = "female"
    case other = "other"

    /// 顯示名稱
    var displayName: String {
        switch self {
        case .male: return "男性"
        case .female: return "女性"
        case .other: return "其他"
        }
    }
}

/// 地址
struct Address: Codable, Identifiable {
    /// 地址 ID
    let id: String

    /// 標籤
    var label: AddressLabel

    /// 收件人
    var recipientName: String

    /// 電話
    var phone: String

    /// 郵遞區號
    var zipCode: String

    /// 城市
    var city: String

    /// 區域
    var district: String

    /// 詳細地址
    var addressLine: String

    /// 是否為預設地址
    var isDefault: Bool

    /// 完整地址
    var fullAddress: String {
        "\(zipCode) \(city)\(district)\(addressLine)"
    }
}

/// 地址標籤
enum AddressLabel: String, Codable {
    case home = "home"
    case office = "office"
    case other = "other"

    /// 顯示名稱
    var displayName: String {
        switch self {
        case .home: return "住家"
        case .office: return "公司"
        case .other: return "其他"
        }
    }
}

/// 使用者偏好設定
struct UserPreferences: Codable {
    /// 語言
    var language: String

    /// 是否啟用推播通知
    var pushNotificationsEnabled: Bool

    /// 是否啟用電子郵件通知
    var emailNotificationsEnabled: Bool

    /// 主題模式
    var themeMode: ThemeMode

    /// 預設付款方式
    var defaultPaymentMethod: PaymentMethod?

    /// 預設初始化
    static var `default`: UserPreferences {
        UserPreferences(
            language: "zh-TW",
            pushNotificationsEnabled: true,
            emailNotificationsEnabled: true,
            themeMode: .system,
            defaultPaymentMethod: nil
        )
    }

    /// CodingKeys for JSON mapping
    enum CodingKeys: String, CodingKey {
        case language
        case pushNotificationsEnabled = "push_notifications_enabled"
        case emailNotificationsEnabled = "email_notifications_enabled"
        case themeMode = "theme_mode"
        case defaultPaymentMethod = "default_payment_method"
    }
}

/// 主題模式
enum ThemeMode: String, Codable {
    case light = "light"
    case dark = "dark"
    case system = "system"

    /// 顯示名稱
    var displayName: String {
        switch self {
        case .light: return "淺色"
        case .dark: return "深色"
        case .system: return "跟隨系統"
        }
    }
}
