import Foundation

class NetworkService {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    // 行 18-22：泛型請求建立（測試提取點，包含泛型）
    func request<T: Decodable>(_ endpoint: APIEndpoint) async throws -> T {
        let request = try buildGenericRequest(endpoint)
        let data = try await fetch(request)
        return try JSONDecoder().decode(T.self, from: data)
    }

    // 行 24-28：請求建立（測試提取點）
    private func buildGenericRequest(_ endpoint: APIEndpoint) throws -> URLRequest {
        var request = URLRequest(url: endpoint.url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    func fetch(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw NetworkError.httpError(httpResponse.statusCode)
        }

        return data
    }
}

/// 泛型 API 回應結構
struct ApiResponse<T: Decodable>: Decodable {
    let success: Bool
    let data: T?
    let message: String?
    let statusCode: Int

    enum CodingKeys: String, CodingKey {
        case success
        case data
        case message
        case statusCode = "status_code"
    }
}

enum NetworkError: Error {
    case invalidResponse
    case httpError(Int)
    case decodingFailed(Error)
    case unknown(Error)
}

enum APIEndpoint {
    case users
    case products
    case orders
    case createUser
    case createOrder

    var url: URL {
        URL(string: "https://api.example.com/\(path)")!
    }

    private var path: String {
        switch self {
        case .users: return "users"
        case .products: return "products"
        case .orders: return "orders"
        case .createUser: return "users"
        case .createOrder: return "orders"
        }
    }
}

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
}
