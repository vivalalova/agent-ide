import Foundation

/// 資料驗證工具
final class Validator {
    /// 單例模式
    static let shared = Validator()

    private init() {}

    /// 驗證電子郵件
    func validateEmail(_ email: String) -> ValidationResult {
        let trimmed = email.trimmed
        guard !trimmed.isEmpty else {
            return .failure(message: "電子郵件不可為空")
        }
        guard trimmed.isValidEmail else {
            return .failure(message: "電子郵件格式不正確")
        }
        return .success
    }

    /// 驗證密碼
    func validatePassword(_ password: String) -> ValidationResult {
        guard !password.isEmpty else {
            return .failure(message: "密碼不可為空")
        }
        guard password.count >= 8 else {
            return .failure(message: "密碼長度至少需要 8 個字元")
        }
        guard password.isValidPassword else {
            return .failure(message: "密碼需包含大小寫字母和數字")
        }
        return .success
    }

    /// 驗證使用者名稱
    func validateUsername(_ username: String) -> ValidationResult {
        let trimmed = username.trimmed
        guard !trimmed.isEmpty else {
            return .failure(message: "使用者名稱不可為空")
        }
        guard trimmed.count >= 3 else {
            return .failure(message: "使用者名稱長度至少需要 3 個字元")
        }
        guard trimmed.count <= 20 else {
            return .failure(message: "使用者名稱長度不可超過 20 個字元")
        }
        let usernameRegex = "^[a-zA-Z0-9_]+$"
        let usernamePredicate = NSPredicate(format: "SELF MATCHES %@", usernameRegex)
        guard usernamePredicate.evaluate(with: trimmed) else {
            return .failure(message: "使用者名稱只能包含英文字母、數字和底線")
        }
        return .success
    }

    /// 驗證電話號碼
    func validatePhoneNumber(_ phoneNumber: String) -> ValidationResult {
        let trimmed = phoneNumber.trimmed
        guard !trimmed.isEmpty else {
            return .failure(message: "電話號碼不可為空")
        }
        let phoneRegex = "^09\\d{8}$"
        let phonePredicate = NSPredicate(format: "SELF MATCHES %@", phoneRegex)
        guard phonePredicate.evaluate(with: trimmed) else {
            return .failure(message: "電話號碼格式不正確（格式：09xxxxxxxx）")
        }
        return .success
    }

    /// 驗證金額
    func validateAmount(_ amount: Double, min: Double = 0, max: Double = Double.infinity) -> ValidationResult {
        guard amount >= min else {
            return .failure(message: "金額不可小於 \(min)")
        }
        guard amount <= max else {
            return .failure(message: "金額不可大於 \(max)")
        }
        return .success
    }

    /// 驗證數量
    func validateQuantity(_ quantity: Int, min: Int = 1, max: Int = Int.max) -> ValidationResult {
        guard quantity >= min else {
            return .failure(message: "數量不可小於 \(min)")
        }
        guard quantity <= max else {
            return .failure(message: "數量不可大於 \(max)")
        }
        return .success
    }
}

/// 驗證結果
enum ValidationResult {
    case success
    case failure(message: String)

    /// 是否驗證成功
    var isValid: Bool {
        if case .success = self {
            return true
        }
        return false
    }

    /// 取得錯誤訊息
    var errorMessage: String? {
        if case .failure(let message) = self {
            return message
        }
        return nil
    }
}
