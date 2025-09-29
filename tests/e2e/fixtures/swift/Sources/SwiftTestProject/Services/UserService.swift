import Foundation
import Collections
import AsyncAlgorithms

/// User service with comprehensive Swift async/await patterns
/// Tests actor isolation, async sequences, and modern Swift concurrency
public actor UserService {

    // MARK: - Properties

    private var users: OrderedDictionary<UUID, User> = [:]
    private var emailIndex: [String: UUID] = [:]
    private let maxConcurrentOperations = 10

    // MARK: - Initialization

    public init() {}

    // MARK: - User Management

    /// Creates a new user with validation
    public func createUser(
        name: String,
        email: String,
        password: String,
        profile: UserProfile? = nil
    ) async throws -> User {
        // Validate email format
        guard isValidEmail(email) else {
            throw UserError.invalidEmail
        }

        // Check for existing email
        if emailIndex[email.lowercased()] != nil {
            throw UserError.emailAlreadyExists
        }

        // Create user profile
        let userProfile = profile ?? UserProfile(
            firstName: name.components(separatedBy: " ").first ?? "",
            lastName: name.components(separatedBy: " ").dropFirst().joined(separator: " ")
        )

        // Create user
        let user = try User(
            name: name,
            email: email.lowercased(),
            password: password,
            profile: userProfile
        )

        // Store user
        users[user.id] = user
        emailIndex[email.lowercased()] = user.id

        return user
    }

    /// Retrieves user by ID
    public func getUser(by id: UUID) async -> User? {
        users[id]
    }

    /// Retrieves user by email
    public func getUser(by email: String) async -> User? {
        guard let id = emailIndex[email.lowercased()] else { return nil }
        return users[id]
    }

    /// Updates user information
    public func updateUser(_ user: User, with updates: UserUpdate) async throws -> User {
        guard var existingUser = users[user.id] else {
            throw UserError.userNotFound
        }

        // Update fields
        if let name = updates.name {
            await existingUser.name = name
        }

        if let email = updates.email {
            guard isValidEmail(email) else {
                throw UserError.invalidEmail
            }

            // Check email availability
            let lowercasedEmail = email.lowercased()
            if let existingId = emailIndex[lowercasedEmail], existingId != user.id {
                throw UserError.emailAlreadyExists
            }

            // Update email index
            emailIndex.removeValue(forKey: existingUser.email)
            emailIndex[lowercasedEmail] = user.id
            await existingUser.email = lowercasedEmail
        }

        if let profile = updates.profile {
            try await existingUser.updateProfile(profile)
        }

        if let preferences = updates.preferences {
            await existingUser.preferences = preferences
        }

        if let status = updates.status {
            await existingUser.status = status
        }

        users[user.id] = existingUser
        return existingUser
    }

    /// Deletes user (soft delete by setting status)
    public func deleteUser(_ user: User) async throws {
        guard var existingUser = users[user.id] else {
            throw UserError.userNotFound
        }

        await existingUser.status = .deleted
        users[user.id] = existingUser
    }

    /// Hard delete user (removes from storage)
    public func removeUser(_ user: User) async throws {
        guard users[user.id] != nil else {
            throw UserError.userNotFound
        }

        users.removeValue(forKey: user.id)
        emailIndex.removeValue(forKey: user.email)
    }
}

// MARK: - User Queries

extension UserService {

    /// Lists users with pagination and filtering
    public func listUsers(
        status: UserStatus? = nil,
        limit: Int = 20,
        offset: Int = 0,
        sortBy: UserSortOption = .name
    ) async -> UserListResult {
        var filteredUsers = Array(users.values)

        // Apply status filter
        if let status = status {
            filteredUsers = filteredUsers.filter { user in
                Task { await user.status == status }.result ?? false
            }
        }

        // Sort users
        filteredUsers.sort { user1, user2 in
            switch sortBy {
            case .name:
                return Task { await user1.name < user2.name }.result ?? false
            case .email:
                return Task { await user1.email < user2.email }.result ?? false
            case .createdAt:
                return user1.createdAt < user2.createdAt
            case .updatedAt:
                return user1.updatedAt < user2.updatedAt
            }
        }

        // Apply pagination
        let total = filteredUsers.count
        let startIndex = min(offset, total)
        let endIndex = min(offset + limit, total)
        let paginatedUsers = Array(filteredUsers[startIndex..<endIndex])

        return UserListResult(
            users: paginatedUsers,
            total: total,
            offset: offset,
            limit: limit,
            hasMore: endIndex < total
        )
    }

    /// Searches users by name or email
    public func searchUsers(
        query: String,
        limit: Int = 20
    ) async -> [User] {
        let lowercasedQuery = query.lowercased()

        return users.values.compactMap { user in
            let nameMatch = Task { await user.name.lowercased().contains(lowercasedQuery) }.result ?? false
            let emailMatch = Task { await user.email.lowercased().contains(lowercasedQuery) }.result ?? false

            return (nameMatch || emailMatch) ? user : nil
        }.prefix(limit).map { $0 }
    }

    /// Gets user count by status
    public func getUserCount(status: UserStatus? = nil) async -> Int {
        if let status = status {
            return users.values.count { user in
                Task { await user.status == status }.result ?? false
            }
        } else {
            return users.count
        }
    }
}

// MARK: - Batch Operations

extension UserService {

    /// Creates multiple users concurrently
    public func createUsers(
        from userData: [(name: String, email: String, password: String)]
    ) async throws -> [User] {
        let semaphore = AsyncSemaphore(value: maxConcurrentOperations)

        return try await withThrowingTaskGroup(of: User.self) { group in
            for data in userData {
                group.addTask {
                    await semaphore.wait()
                    defer { semaphore.signal() }

                    return try await self.createUser(
                        name: data.name,
                        email: data.email,
                        password: data.password
                    )
                }
            }

            var createdUsers: [User] = []
            for try await user in group {
                createdUsers.append(user)
            }

            return createdUsers
        }
    }

    /// Updates multiple users concurrently
    public func updateUsers(
        _ updates: [(user: User, update: UserUpdate)]
    ) async throws -> [User] {
        let semaphore = AsyncSemaphore(value: maxConcurrentOperations)

        return try await withThrowingTaskGroup(of: User.self) { group in
            for (user, update) in updates {
                group.addTask {
                    await semaphore.wait()
                    defer { semaphore.signal() }

                    return try await self.updateUser(user, with: update)
                }
            }

            var updatedUsers: [User] = []
            for try await user in group {
                updatedUsers.append(user)
            }

            return updatedUsers
        }
    }

    /// Processes users with async stream
    public func processUsers<T>(
        transform: @Sendable @escaping (User) async throws -> T
    ) -> AsyncThrowingStream<T, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    for user in users.values {
                        let result = try await transform(user)
                        continuation.yield(result)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }
}

// MARK: - Analytics

extension UserService {

    /// Calculates user analytics
    public func calculateAnalytics() async -> UserAnalytics {
        let totalUsers = users.count
        let activeUsers = await getUserCount(status: .active)
        let inactiveUsers = await getUserCount(status: .inactive)
        let suspendedUsers = await getUserCount(status: .suspended)

        // Calculate activity scores concurrently
        let activityScores = await withTaskGroup(of: Double.self) { group in
            for user in users.values {
                group.addTask {
                    await user.calculateActivityScore()
                }
            }

            var scores: [Double] = []
            for await score in group {
                scores.append(score)
            }
            return scores
        }

        let averageActivityScore = activityScores.isEmpty ? 0 : activityScores.reduce(0, +) / Double(activityScores.count)

        return UserAnalytics(
            totalUsers: totalUsers,
            activeUsers: activeUsers,
            inactiveUsers: inactiveUsers,
            suspendedUsers: suspendedUsers,
            averageActivityScore: averageActivityScore,
            userGrowthRate: calculateGrowthRate()
        )
    }

    private func calculateGrowthRate() -> Double {
        // Simplified growth rate calculation
        let thirtyDaysAgo = Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date()
        let recentUsers = users.values.filter { $0.createdAt > thirtyDaysAgo }
        let totalUsers = users.count

        guard totalUsers > 0 else { return 0 }
        return Double(recentUsers.count) / Double(totalUsers) * 100
    }
}

// MARK: - Utilities

extension UserService {

    private func isValidEmail(_ email: String) -> Bool {
        let emailRegex = #"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"#
        return email.range(of: emailRegex, options: .regularExpression) != nil
    }
}

// MARK: - Supporting Types

public struct UserUpdate: Sendable {
    public let name: String?
    public let email: String?
    public let profile: UserProfile?
    public let preferences: UserPreferences?
    public let status: UserStatus?

    public init(
        name: String? = nil,
        email: String? = nil,
        profile: UserProfile? = nil,
        preferences: UserPreferences? = nil,
        status: UserStatus? = nil
    ) {
        self.name = name
        self.email = email
        self.profile = profile
        self.preferences = preferences
        self.status = status
    }
}

public struct UserListResult: Sendable {
    public let users: [User]
    public let total: Int
    public let offset: Int
    public let limit: Int
    public let hasMore: Bool

    public init(users: [User], total: Int, offset: Int, limit: Int, hasMore: Bool) {
        self.users = users
        self.total = total
        self.offset = offset
        self.limit = limit
        self.hasMore = hasMore
    }
}

public enum UserSortOption: String, CaseIterable, Sendable {
    case name, email, createdAt, updatedAt

    public var displayName: String {
        switch self {
        case .name: return "Name"
        case .email: return "Email"
        case .createdAt: return "Created Date"
        case .updatedAt: return "Updated Date"
        }
    }
}

public struct UserAnalytics: Sendable {
    public let totalUsers: Int
    public let activeUsers: Int
    public let inactiveUsers: Int
    public let suspendedUsers: Int
    public let averageActivityScore: Double
    public let userGrowthRate: Double

    public init(
        totalUsers: Int,
        activeUsers: Int,
        inactiveUsers: Int,
        suspendedUsers: Int,
        averageActivityScore: Double,
        userGrowthRate: Double
    ) {
        self.totalUsers = totalUsers
        self.activeUsers = activeUsers
        self.inactiveUsers = inactiveUsers
        self.suspendedUsers = suspendedUsers
        self.averageActivityScore = averageActivityScore
        self.userGrowthRate = userGrowthRate
    }
}

// MARK: - Async Semaphore

public actor AsyncSemaphore {
    private var value: Int
    private var waiters: [CheckedContinuation<Void, Never>] = []

    public init(value: Int) {
        self.value = value
    }

    public func wait() async {
        if value > 0 {
            value -= 1
        } else {
            await withCheckedContinuation { continuation in
                waiters.append(continuation)
            }
        }
    }

    public func signal() {
        if waiters.isEmpty {
            value += 1
        } else {
            let waiter = waiters.removeFirst()
            waiter.resume()
        }
    }
}

// MARK: - Result Extension

extension Task where Success == Bool, Failure == Never {
    var result: Bool {
        do {
            return try Task.checkCancellation() == Void() ? false : true
        } catch {
            return false
        }
    }
}