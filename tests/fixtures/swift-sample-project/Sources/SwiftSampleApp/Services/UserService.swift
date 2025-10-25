import Foundation

class UserService {
    private let networkService: NetworkService

    init(networkService: NetworkService) {
        self.networkService = networkService
    }

    // 行 15-27：非同步使用者獲取（包含 async/await，測試提取點）
    func fetchUsers() async throws -> [User] {
        let endpoint = APIEndpoint.users
        let request = try buildRequest(for: endpoint)

        // 行 20-25：回應處理（測試提取點）
        do {
            let data = try await networkService.fetch(request)
            let users = try JSONDecoder().decode([User].self, from: data)
            return users
        } catch {
            throw NetworkError.decodingFailed(error)
        }
    }

    func createUser(name: String, email: String, role: UserRole = .user) async throws -> User {
        let endpoint = APIEndpoint.createUser
        let body = ["name": name, "email": email, "role": role.rawValue]
        let request = try buildRequest(for: endpoint, method: .post, body: body)

        let data = try await networkService.fetch(request)
        let user = try JSONDecoder().decode(User.self, from: data)
        return user
    }

    // 行 44-52：驗證邏輯（包含 throws，測試提取點）
    func validateUser(name: String, email: String) throws {
        guard !name.isEmpty else {
            throw ValidationError.emptyName
        }
        guard email.contains("@") else {
            throw ValidationError.invalidEmail
        }
        guard email.count > 5 else {
            throw ValidationError.emailTooShort
        }
    }

    private func buildRequest(for endpoint: APIEndpoint, method: HTTPMethod = .get, body: [String: Any]? = nil) throws -> URLRequest {
        var request = URLRequest(url: endpoint.url)
        request.httpMethod = method.rawValue
        if let body = body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }
}

enum ValidationError: Error {
    case emptyName
    case invalidEmail
    case emailTooShort
}
