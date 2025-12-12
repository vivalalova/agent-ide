import Foundation

/// 使用者模型
public struct User: Codable, Identifiable {
    public let id: UUID
    public var name: String
    public var email: String
    public var age: Int
    private var internalData: String

    public init(id: UUID = UUID(), name: String, email: String, age: Int) {
        self.id = id
        self.name = name
        self.email = email
        self.age = age
        self.internalData = ""
    }

    /// 驗證使用者資料
    public func validate() -> Bool {
        return !name.isEmpty && email.contains("@") && age >= 0
    }

    /// 格式化顯示名稱
    public func displayName() -> String {
        return "\(name) <\(email)>"
    }

    private func processInternalData() {
        // 私有方法
    }
}

/// 使用者角色
public enum UserRole: String, Codable {
    case admin
    case user
    case guest
}

/// 使用者狀態
public enum UserStatus {
    case active
    case inactive
    case suspended(reason: String)
}
