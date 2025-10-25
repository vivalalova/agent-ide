import Foundation

/// 使用者資料模型
struct User: Codable, Identifiable {
    /// 使用者唯一識別碼
    let id: String

    /// 使用者名稱
    let username: String

    /// 電子郵件地址
    let email: String

    /// 顯示名稱
    let displayName: String

    /// 頭像 URL
    let avatarURL: String?

    /// 使用者角色
    let role: UserRole

    /// 建立時間
    let createdAt: Date

    /// 最後登入時間
    var lastLoginAt: Date?

    /// CodingKeys for JSON mapping
    enum CodingKeys: String, CodingKey {
        case id
        case username
        case email
        case displayName = "display_name"
        case avatarURL = "avatar_url"
        case role
        case createdAt = "created_at"
        case lastLoginAt = "last_login_at"
    }
}

/// 使用者角色枚舉
enum UserRole: String, Codable {
    case admin = "admin"
    case user = "user"
    case guest = "guest"

    /// 角色顯示名稱
    var displayName: String {
        switch self {
        case .admin: return "管理員"
        case .user: return "一般使用者"
        case .guest: return "訪客"
        }
    }

    /// 是否具有管理權限
    var hasAdminPrivileges: Bool {
        self == .admin
    }
}
