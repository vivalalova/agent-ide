import Foundation

/// Validation result
struct ValidationResult {
    /// Is valid
    let isValid: Bool
    /// Error message if invalid
    let errorMessage: String?

    /// Success result
    static let success = ValidationResult(isValid: true, errorMessage: nil)

    /// Failure result with message
    static func failure(_ message: String) -> ValidationResult {
        ValidationResult(isValid: false, errorMessage: message)
    }
}

/// Validator utility
final class Validator {
    /// Shared instance
    static let shared = Validator()

    private init() {}

    /// Validate email
    func validateEmail(_ email: String) -> ValidationResult {
        guard !email.isEmpty else {
            return .failure("Email cannot be empty")
        }

        let pattern = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        guard email.range(of: pattern, options: .regularExpression) != nil else {
            return .failure("Invalid email format")
        }

        return .success
    }

    /// Validate password
    func validatePassword(_ password: String) -> ValidationResult {
        guard password.count >= 8 else {
            return .failure("Password must be at least 8 characters")
        }

        let hasUppercase = password.range(of: "[A-Z]", options: .regularExpression) != nil
        let hasLowercase = password.range(of: "[a-z]", options: .regularExpression) != nil
        let hasNumber = password.range(of: "[0-9]", options: .regularExpression) != nil

        guard hasUppercase && hasLowercase && hasNumber else {
            return .failure("Password must contain uppercase, lowercase, and number")
        }

        return .success
    }

    /// Validate username
    func validateUsername(_ username: String) -> ValidationResult {
        guard username.count >= 3 else {
            return .failure("Username must be at least 3 characters")
        }

        guard username.count <= 20 else {
            return .failure("Username must be at most 20 characters")
        }

        let pattern = "^[a-zA-Z0-9_]+$"
        guard username.range(of: pattern, options: .regularExpression) != nil else {
            return .failure("Username can only contain letters, numbers, and underscores")
        }

        return .success
    }
}
