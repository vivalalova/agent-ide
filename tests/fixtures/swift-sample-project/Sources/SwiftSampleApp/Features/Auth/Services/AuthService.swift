import Foundation

/// 認證服務實作
final class AuthService: AuthServiceProtocol {
    /// 網路服務
    private let networkService: NetworkServiceProtocol

    /// Keychain 管理器
    private let keychainManager: KeychainManager

    /// UserDefaults 管理器
    private let userDefaultsManager: UserDefaultsManager

    /// 當前使用者
    private(set) var currentUser: User?

    /// 初始化
    init(networkService: NetworkServiceProtocol, keychainManager: KeychainManager, userDefaultsManager: UserDefaultsManager) {
        self.networkService = networkService
        self.keychainManager = keychainManager
        self.userDefaultsManager = userDefaultsManager
        loadCachedUser()
    }

    /// 登入
    func login(email: String, password: String) async throws -> User {
        let credentials = AuthCredentials(email: email, password: password)

        guard credentials.isValid else {
            throw ValidationError.invalidEmail("電子郵件或密碼格式不正確")
        }

        let endpoint = LoginEndpoint(email: email, password: password)
        let response: AuthResponse = try await networkService.request(endpoint)

        try saveAuthTokens(accessToken: response.accessToken, refreshToken: response.refreshToken)
        currentUser = response.user
        try saveUserToCache(response.user)

        Logger.shared.log("User logged in: \(response.user.username)", level: .info)
        NotificationCenter.default.post(name: AppConstants.NotificationName.userDidLogin, object: response.user)

        return response.user
    }

    /// 登出
    func logout() async throws {
        try keychainManager.remove(forKey: AppConstants.KeychainKeys.accessToken)
        try keychainManager.remove(forKey: AppConstants.KeychainKeys.refreshToken)
        userDefaultsManager.remove(forKey: AppConstants.UserDefaultsKeys.cachedUser)

        currentUser = nil

        Logger.shared.log("User logged out", level: .info)
        NotificationCenter.default.post(name: AppConstants.NotificationName.userDidLogout, object: nil)
    }

    /// 註冊
    func register(username: String, email: String, password: String) async throws -> User {
        let request = RegisterRequest(
            username: username,
            email: email,
            password: password,
            confirmPassword: password,
            deviceId: UIDevice.current.identifierForVendor?.uuidString ?? ""
        )

        try request.validate()

        let endpoint = RegisterEndpoint(request: request)
        let response: AuthResponse = try await networkService.request(endpoint)

        try saveAuthTokens(accessToken: response.accessToken, refreshToken: response.refreshToken)
        currentUser = response.user
        try saveUserToCache(response.user)

        Logger.shared.log("User registered: \(response.user.username)", level: .info)
        return response.user
    }

    /// 重新整理權杖
    func refreshToken() async throws -> String {
        guard let refreshToken = try keychainManager.load(forKey: AppConstants.KeychainKeys.refreshToken) else {
            throw NetworkError.unauthorized
        }

        let endpoint = RefreshTokenEndpoint(refreshToken: refreshToken)
        let response: AuthResponse = try await networkService.request(endpoint)

        try saveAuthTokens(accessToken: response.accessToken, refreshToken: response.refreshToken)

        Logger.shared.log("Token refreshed", level: .info)
        return response.accessToken
    }

    /// 驗證權杖
    func validateToken() async throws -> Bool {
        guard let accessToken = try keychainManager.load(forKey: AppConstants.KeychainKeys.accessToken) else {
            return false
        }

        let endpoint = ValidateTokenEndpoint(token: accessToken)
        let response: TokenValidationResponse = try await networkService.request(endpoint)

        return response.isValid
    }

    /// 儲存認證權杖
    private func saveAuthTokens(accessToken: String, refreshToken: String) throws {
        try keychainManager.save(accessToken, forKey: AppConstants.KeychainKeys.accessToken)
        try keychainManager.save(refreshToken, forKey: AppConstants.KeychainKeys.refreshToken)
    }

    /// 儲存使用者到快取
    private func saveUserToCache(_ user: User) throws {
        try userDefaultsManager.save(user, forKey: AppConstants.UserDefaultsKeys.cachedUser)
    }

    /// 載入快取的使用者
    private func loadCachedUser() {
        currentUser = try? userDefaultsManager.load(forKey: AppConstants.UserDefaultsKeys.cachedUser)
    }
}

/// 註冊端點
struct RegisterEndpoint: APIEndpoint {
    let request: RegisterRequest

    var path: String { APIConstants.Endpoint.Auth.register }
    var method: HTTPMethod { .post }
    var queryParameters: [String: String]? { nil }
    var headers: [String: String]? { nil }

    var body: Data? {
        try? JSONEncoder().encode(request)
    }
}

/// 重新整理權杖端點
struct RefreshTokenEndpoint: APIEndpoint {
    let refreshToken: String

    var path: String { APIConstants.Endpoint.Auth.refreshToken }
    var method: HTTPMethod { .post }
    var queryParameters: [String: String]? { nil }
    var headers: [String: String]? { nil }

    var body: Data? {
        try? JSONEncoder().encode(["refresh_token": refreshToken])
    }
}

/// 驗證權杖端點
struct ValidateTokenEndpoint: APIEndpoint {
    let token: String

    var path: String { APIConstants.Endpoint.Auth.validateToken }
    var method: HTTPMethod { .post }
    var queryParameters: [String: String]? { nil }
    var headers: [String: String]? {
        [APIConstants.HeaderKey.authorization: "Bearer \(token)"]
    }
    var body: Data? { nil }
}

/// 權杖驗證回應
struct TokenValidationResponse: Codable {
    let isValid: Bool

    enum CodingKeys: String, CodingKey {
        case isValid = "is_valid"
    }
}
