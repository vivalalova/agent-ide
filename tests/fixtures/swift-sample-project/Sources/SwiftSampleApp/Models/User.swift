import Foundation

/// User role enumeration
enum UserRole: String, Codable {
    case admin
    case user
    case guest
}

/// User model
struct User: Codable, Identifiable {
    /// User ID
    let id: String
    /// User name
    let name: String
    /// Email address
    let email: String
    /// User role
    let role: UserRole
    /// Created date
    let createdAt: Date

    /// Check if user is admin
    var isAdmin: Bool {
        role == .admin
    }
}
