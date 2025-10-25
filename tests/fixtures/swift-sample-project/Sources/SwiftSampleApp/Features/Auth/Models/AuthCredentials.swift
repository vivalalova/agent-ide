import Foundation

/// 認證憑證
struct AuthCredentials: Codable {
    /// 電子郵件
    let email: String

    /// 密碼
    let password: String

    /// 裝置 ID
    let deviceId: String

    /// 驗證電子郵件
    var isValid: Bool {
        Validator.shared.validateEmail(email).isValid &&
        Validator.shared.validatePassword(password).isValid
    }

    /// 初始化
    init(email: String, password: String, deviceId: String = UIDevice.current.identifierForVendor?.uuidString ?? "") {
        self.email = email
        self.password = password
        self.deviceId = deviceId
    }
}

/// 認證回應
struct AuthResponse: Codable {
    /// 存取權杖
    let accessToken: String

    /// 重新整理權杖
    let refreshToken: String

    /// 權杖類型
    let tokenType: String

    /// 過期時間（秒）
    let expiresIn: Int

    /// 使用者資訊
    let user: User

    /// CodingKeys for JSON mapping
    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case tokenType = "token_type"
        case expiresIn = "expires_in"
        case user
    }
}

/// 註冊請求
struct RegisterRequest: Codable {
    /// 使用者名稱
    let username: String

    /// 電子郵件
    let email: String

    /// 密碼
    let password: String

    /// 確認密碼
    let confirmPassword: String

    /// 裝置 ID
    let deviceId: String

    /// 驗證資料
    func validate() throws {
        let usernameValidation = Validator.shared.validateUsername(username)
        guard usernameValidation.isValid else {
            throw ValidationError.invalidUsername(usernameValidation.errorMessage ?? "")
        }

        let emailValidation = Validator.shared.validateEmail(email)
        guard emailValidation.isValid else {
            throw ValidationError.invalidEmail(emailValidation.errorMessage ?? "")
        }

        let passwordValidation = Validator.shared.validatePassword(password)
        guard passwordValidation.isValid else {
            throw ValidationError.invalidPassword(passwordValidation.errorMessage ?? "")
        }

        guard password == confirmPassword else {
            throw ValidationError.passwordMismatch
        }
    }

    /// CodingKeys for JSON mapping
    enum CodingKeys: String, CodingKey {
        case username
        case email
        case password
        case confirmPassword = "confirm_password"
        case deviceId = "device_id"
    }
}

/// 驗證錯誤
enum ValidationError: LocalizedError {
    case invalidUsername(String)
    case invalidEmail(String)
    case invalidPassword(String)
    case passwordMismatch

    /// 錯誤描述
    var errorDescription: String? {
        switch self {
        case .invalidUsername(let message):
            return message
        case .invalidEmail(let message):
            return message
        case .invalidPassword(let message):
            return message
        case .passwordMismatch:
            return "密碼與確認密碼不一致"
        }
    }
}
