import Foundation
import Crypto

/// User model with comprehensive Swift language features
/// Tests complex Swift patterns including protocols, generics, and async/await
@MainActor
public final class User: ObservableObject, Identifiable, Codable, Sendable {
    public let id: UUID
    @Published public var name: String
    @Published public var email: String
    @Published public var profile: UserProfile
    @Published public var preferences: UserPreferences
    @Published public var status: UserStatus

    private var passwordHash: String

    public let createdAt: Date
    public let updatedAt: Date

    public init(
        id: UUID = UUID(),
        name: String,
        email: String,
        password: String,
        profile: UserProfile,
        preferences: UserPreferences = UserPreferences(),
        status: UserStatus = .active
    ) throws {
        self.id = id
        self.name = name
        self.email = email
        self.profile = profile
        self.preferences = preferences
        self.status = status
        self.passwordHash = try Self.hashPassword(password)
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    // MARK: - Codable

    enum CodingKeys: CodingKey {
        case id, name, email, profile, preferences, status, passwordHash, createdAt, updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        id = try container.decode(UUID.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        email = try container.decode(String.self, forKey: .email)
        profile = try container.decode(UserProfile.self, forKey: .profile)
        preferences = try container.decode(UserPreferences.self, forKey: .preferences)
        status = try container.decode(UserStatus.self, forKey: .status)
        passwordHash = try container.decode(String.self, forKey: .passwordHash)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(email, forKey: .email)
        try container.encode(profile, forKey: .profile)
        try container.encode(preferences, forKey: .preferences)
        try container.encode(status, forKey: .status)
        try container.encode(passwordHash, forKey: .passwordHash)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
    }
}

// MARK: - User Extensions

extension User {
    /// Validates password against stored hash
    public func validatePassword(_ password: String) async throws -> Bool {
        let inputHash = try Self.hashPassword(password)
        return inputHash == passwordHash
    }

    /// Updates user password with validation
    public func updatePassword(from oldPassword: String, to newPassword: String) async throws {
        guard try await validatePassword(oldPassword) else {
            throw UserError.invalidPassword
        }

        guard newPassword.count >= 8 else {
            throw UserError.passwordTooShort
        }

        passwordHash = try Self.hashPassword(newPassword)
    }

    /// Updates user profile with validation
    public func updateProfile(_ profile: UserProfile) throws {
        guard profile.isValid else {
            throw UserError.invalidProfile
        }

        self.profile = profile
    }

    /// Calculates user activity score based on various metrics
    public func calculateActivityScore() async -> Double {
        await withTaskGroup(of: Double.self) { group in
            group.addTask { await self.calculateLoginScore() }
            group.addTask { await self.calculateEngagementScore() }
            group.addTask { await self.calculateProfileCompletenessScore() }

            var totalScore = 0.0
            for await score in group {
                totalScore += score
            }

            return min(totalScore / 3.0, 100.0)
        }
    }

    private func calculateLoginScore() async -> Double {
        // Simulate async calculation
        try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
        return Double.random(in: 0...100)
    }

    private func calculateEngagementScore() async -> Double {
        try? await Task.sleep(nanoseconds: 100_000_000)
        return Double.random(in: 0...100)
    }

    private func calculateProfileCompletenessScore() async -> Double {
        var score = 0.0

        if !profile.firstName.isEmpty { score += 20 }
        if !profile.lastName.isEmpty { score += 20 }
        if profile.avatar != nil { score += 20 }
        if profile.bio != nil { score += 20 }
        if profile.location != nil { score += 20 }

        return score
    }
}

// MARK: - Static Methods

extension User {
    private static func hashPassword(_ password: String) throws -> String {
        let data = Data(password.utf8)
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }

    /// Factory method for creating admin users
    public static func createAdmin(
        name: String,
        email: String,
        password: String
    ) async throws -> User {
        let profile = UserProfile(
            firstName: name.components(separatedBy: " ").first ?? "",
            lastName: name.components(separatedBy: " ").dropFirst().joined(separator: " "),
            bio: "System Administrator"
        )

        let preferences = UserPreferences(
            theme: .system,
            notifications: NotificationPreferences(
                email: true,
                push: true,
                marketing: false
            )
        )

        let user = try User(
            name: name,
            email: email,
            password: password,
            profile: profile,
            preferences: preferences,
            status: .active
        )

        return user
    }

    /// Bulk user creation with concurrent processing
    public static func createUsers(
        from userData: [(name: String, email: String, password: String)]
    ) async throws -> [User] {
        try await withThrowingTaskGroup(of: User.self) { group in
            for data in userData {
                group.addTask {
                    let profile = UserProfile(
                        firstName: data.name.components(separatedBy: " ").first ?? "",
                        lastName: data.name.components(separatedBy: " ").dropFirst().joined(separator: " ")
                    )

                    return try User(
                        name: data.name,
                        email: data.email,
                        password: data.password,
                        profile: profile
                    )
                }
            }

            var users: [User] = []
            for try await user in group {
                users.append(user)
            }

            return users.sorted { $0.name < $1.name }
        }
    }
}

// MARK: - Supporting Types

public struct UserProfile: Codable, Sendable {
    public var firstName: String
    public var lastName: String
    public var avatar: URL?
    public var bio: String?
    public var location: Location?
    public var socialLinks: SocialLinks?

    public init(
        firstName: String,
        lastName: String,
        avatar: URL? = nil,
        bio: String? = nil,
        location: Location? = nil,
        socialLinks: SocialLinks? = nil
    ) {
        self.firstName = firstName
        self.lastName = lastName
        self.avatar = avatar
        self.bio = bio
        self.location = location
        self.socialLinks = socialLinks
    }

    public var fullName: String {
        "\(firstName) \(lastName)".trimmingCharacters(in: .whitespaces)
    }

    public var isValid: Bool {
        !firstName.isEmpty && !lastName.isEmpty
    }
}

public struct Location: Codable, Sendable {
    public let country: String
    public let city: String
    public let timezone: TimeZone

    public init(country: String, city: String, timezone: TimeZone) {
        self.country = country
        self.city = city
        self.timezone = timezone
    }
}

public struct SocialLinks: Codable, Sendable {
    public var twitter: URL?
    public var github: URL?
    public var linkedin: URL?
    public var website: URL?

    public init(
        twitter: URL? = nil,
        github: URL? = nil,
        linkedin: URL? = nil,
        website: URL? = nil
    ) {
        self.twitter = twitter
        self.github = github
        self.linkedin = linkedin
        self.website = website
    }
}

public struct UserPreferences: Codable, Sendable {
    public var theme: Theme
    public var language: Locale
    public var notifications: NotificationPreferences
    public var privacy: PrivacySettings

    public init(
        theme: Theme = .system,
        language: Locale = .current,
        notifications: NotificationPreferences = NotificationPreferences(),
        privacy: PrivacySettings = PrivacySettings()
    ) {
        self.theme = theme
        self.language = language
        self.notifications = notifications
        self.privacy = privacy
    }
}

public enum Theme: String, Codable, CaseIterable, Sendable {
    case light, dark, system

    public var displayName: String {
        switch self {
        case .light: return "Light"
        case .dark: return "Dark"
        case .system: return "System"
        }
    }
}

public struct NotificationPreferences: Codable, Sendable {
    public var email: Bool
    public var push: Bool
    public var marketing: Bool
    public var security: Bool

    public init(
        email: Bool = true,
        push: Bool = true,
        marketing: Bool = false,
        security: Bool = true
    ) {
        self.email = email
        self.push = push
        self.marketing = marketing
        self.security = security
    }
}

public struct PrivacySettings: Codable, Sendable {
    public var profileVisibility: ProfileVisibility
    public var allowFollowers: Bool
    public var showActivity: Bool
    public var dataSharing: Bool

    public init(
        profileVisibility: ProfileVisibility = .public,
        allowFollowers: Bool = true,
        showActivity: Bool = false,
        dataSharing: Bool = false
    ) {
        self.profileVisibility = profileVisibility
        self.allowFollowers = allowFollowers
        self.showActivity = showActivity
        self.dataSharing = dataSharing
    }
}

public enum ProfileVisibility: String, Codable, CaseIterable, Sendable {
    case `public`, friends, `private`

    public var displayName: String {
        switch self {
        case .public: return "Public"
        case .friends: return "Friends Only"
        case .private: return "Private"
        }
    }
}

public enum UserStatus: String, Codable, CaseIterable, Sendable {
    case active, inactive, suspended, deleted

    public var isActive: Bool {
        self == .active
    }
}

// MARK: - Errors

public enum UserError: Error, LocalizedError, Sendable {
    case invalidEmail
    case invalidPassword
    case passwordTooShort
    case invalidProfile
    case userNotFound
    case emailAlreadyExists
    case insufficientPermissions

    public var errorDescription: String? {
        switch self {
        case .invalidEmail:
            return "Invalid email address"
        case .invalidPassword:
            return "Invalid password"
        case .passwordTooShort:
            return "Password must be at least 8 characters"
        case .invalidProfile:
            return "Invalid user profile"
        case .userNotFound:
            return "User not found"
        case .emailAlreadyExists:
            return "Email address already exists"
        case .insufficientPermissions:
            return "Insufficient permissions"
        }
    }
}