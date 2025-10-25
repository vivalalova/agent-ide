import XCTest
@testable import SwiftSampleApp

/// 認證服務測試
final class AuthServiceTests: XCTestCase {
    /// 待測試的服務
    var authService: AuthService!

    /// Mock 網路服務
    var mockNetworkService: MockNetworkService!

    /// Mock Keychain 管理器
    var mockKeychainManager: KeychainManager!

    /// Mock UserDefaults 管理器
    var mockUserDefaultsManager: UserDefaultsManager!

    /// 設定測試環境
    override func setUp() async throws {
        mockNetworkService = MockNetworkService()
        mockKeychainManager = KeychainManager()
        mockUserDefaultsManager = UserDefaultsManager()

        authService = AuthService(
            networkService: mockNetworkService,
            keychainManager: mockKeychainManager,
            userDefaultsManager: mockUserDefaultsManager
        )
    }

    /// 清理測試環境
    override func tearDown() async throws {
        authService = nil
        mockNetworkService = nil
        mockKeychainManager = nil
        mockUserDefaultsManager = nil
    }

    /// 測試登入成功
    func testLoginSuccess() async throws {
        let email = "test@example.com"
        let password = "Password123"

        let expectedUser = User(
            id: "user123",
            username: "testuser",
            email: email,
            displayName: "Test User",
            avatarURL: nil,
            role: .user,
            createdAt: Date(),
            lastLoginAt: Date()
        )

        mockNetworkService.mockAuthResponse = AuthResponse(
            accessToken: "access_token_123",
            refreshToken: "refresh_token_456",
            tokenType: "Bearer",
            expiresIn: 3600,
            user: expectedUser
        )

        let user = try await authService.login(email: email, password: password)

        XCTAssertEqual(user.id, expectedUser.id)
        XCTAssertEqual(user.email, email)
        XCTAssertNotNil(authService.currentUser)
    }

    /// 測試登入失敗（無效憑證）
    func testLoginFailureInvalidCredentials() async {
        let email = "invalid@example.com"
        let password = "wrong"

        mockNetworkService.shouldFail = true

        do {
            _ = try await authService.login(email: email, password: password)
            XCTFail("Expected login to fail")
        } catch {
            XCTAssertNotNil(error)
        }
    }

    /// 測試登出
    func testLogout() async throws {
        try await authService.logout()
        XCTAssertNil(authService.currentUser)
    }

    /// 測試權杖驗證
    func testTokenValidation() async throws {
        mockNetworkService.mockTokenValidation = TokenValidationResponse(isValid: true)

        let isValid = try await authService.validateToken()
        XCTAssertTrue(isValid)
    }
}

/// Mock 網路服務
final class MockNetworkService: NetworkServiceProtocol {
    /// 是否應該失敗
    var shouldFail: Bool = false

    /// Mock 認證回應
    var mockAuthResponse: AuthResponse?

    /// Mock 權杖驗證回應
    var mockTokenValidation: TokenValidationResponse?

    /// 執行請求
    func request<T: Codable>(_ endpoint: APIEndpoint) async throws -> T {
        if shouldFail {
            throw NetworkError.unauthorized
        }

        if T.self == AuthResponse.self, let response = mockAuthResponse as? T {
            return response
        }

        if T.self == TokenValidationResponse.self, let response = mockTokenValidation as? T {
            return response
        }

        throw NetworkError.unknown(NSError(domain: "MockNetworkService", code: -1))
    }

    /// 執行請求並回傳完整回應
    func requestWithResponse<T: Codable>(_ endpoint: APIEndpoint) async throws -> APIResponse<T> {
        throw NetworkError.unknown(NSError(domain: "MockNetworkService", code: -1))
    }

    /// 上傳資料
    func upload(data: Data, to endpoint: APIEndpoint) async throws -> Data {
        throw NetworkError.unknown(NSError(domain: "MockNetworkService", code: -1))
    }
}
