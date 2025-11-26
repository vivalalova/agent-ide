import Foundation

/// User service errors
enum UserServiceError: Error {
    case userNotFound
    case invalidEmail
    case duplicateEmail
    case networkError(Error)
}

/// User service protocol
protocol UserServiceProtocol {
    func getUser(id: String) async throws -> User
    func getAllUsers() async throws -> [User]
    func createUser(name: String, email: String, role: UserRole) async throws -> User
    func updateUser(_ user: User) async throws -> User
    func deleteUser(id: String) async throws -> Bool
}

/// User service implementation
final class UserService: UserServiceProtocol {
    /// Simulated users storage
    private var users: [String: User] = [:]

    /// Get user by ID
    func getUser(id: String) async throws -> User {
        guard let user = users[id] else {
            throw UserServiceError.userNotFound
        }
        return user
    }

    /// Get all users
    func getAllUsers() async throws -> [User] {
        Array(users.values)
    }

    /// Create new user
    func createUser(name: String, email: String, role: UserRole) async throws -> User {
        guard isValidEmail(email) else {
            throw UserServiceError.invalidEmail
        }

        let user = User(
            id: UUID().uuidString,
            name: name,
            email: email,
            role: role,
            createdAt: Date()
        )
        users[user.id] = user
        return user
    }

    /// Update user
    func updateUser(_ user: User) async throws -> User {
        guard users[user.id] != nil else {
            throw UserServiceError.userNotFound
        }
        users[user.id] = user
        return user
    }

    /// Delete user
    func deleteUser(id: String) async throws -> Bool {
        guard users[id] != nil else {
            throw UserServiceError.userNotFound
        }
        users.removeValue(forKey: id)
        return true
    }

    /// Validate email format
    private func isValidEmail(_ email: String) -> Bool {
        let pattern = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        return email.range(of: pattern, options: .regularExpression) != nil
    }
}
