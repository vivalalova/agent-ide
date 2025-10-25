import Foundation

/// API 端點協定
protocol APIEndpoint {
    /// 路徑
    var path: String { get }

    /// HTTP 方法
    var method: HTTPMethod { get }

    /// Query 參數
    var queryParameters: [String: String]? { get }

    /// Request body
    var body: Data? { get }

    /// 額外的 headers
    var headers: [String: String]? { get }

    /// 建立 URLRequest
    func asURLRequest() throws -> URLRequest
}

extension APIEndpoint {
    /// 預設實作：建立 URLRequest
    func asURLRequest() throws -> URLRequest {
        guard var components = URLComponents(string: APIConstants.apiBaseURL + path) else {
            throw NetworkError.invalidURL
        }

        if let queryParameters = queryParameters {
            components.queryItems = queryParameters.map { URLQueryItem(name: $0.key, value: $0.value) }
        }

        guard let url = components.url else {
            throw NetworkError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.timeoutInterval = APIConstants.requestTimeout

        // 設定預設 headers
        request.setValue(APIConstants.ContentType.json, forHTTPHeaderField: APIConstants.HeaderKey.contentType)
        request.setValue(APIConstants.ContentType.json, forHTTPHeaderField: APIConstants.HeaderKey.accept)
        request.setValue(AppConstants.appVersion, forHTTPHeaderField: APIConstants.HeaderKey.appVersion)
        request.setValue("iOS", forHTTPHeaderField: APIConstants.HeaderKey.platform)

        // 設定額外的 headers
        headers?.forEach { key, value in
            request.setValue(value, forHTTPHeaderField: key)
        }

        // 設定 body
        if let body = body {
            request.httpBody = body
        }

        return request
    }
}

/// 具體的端點實作範例
struct LoginEndpoint: APIEndpoint {
    let email: String
    let password: String

    var path: String { APIConstants.Endpoint.Auth.login }
    var method: HTTPMethod { .post }
    var queryParameters: [String: String]? { nil }
    var headers: [String: String]? { nil }

    var body: Data? {
        let credentials = ["email": email, "password": password]
        return try? JSONEncoder().encode(credentials)
    }
}

/// 產品列表端點
struct ProductListEndpoint: APIEndpoint {
    let page: Int
    let pageSize: Int
    let category: String?
    let searchQuery: String?

    var path: String { APIConstants.Endpoint.Product.list }
    var method: HTTPMethod { .get }
    var body: Data? { nil }
    var headers: [String: String]? { nil }

    var queryParameters: [String: String]? {
        var params: [String: String] = [
            "page": "\(page)",
            "page_size": "\(pageSize)"
        ]
        if let category = category {
            params["category"] = category
        }
        if let searchQuery = searchQuery {
            params["q"] = searchQuery
        }
        return params
    }
}

/// 訂單詳情端點
struct OrderDetailEndpoint: APIEndpoint {
    let orderId: String

    var path: String { APIConstants.Endpoint.Order.detail(id: orderId) }
    var method: HTTPMethod { .get }
    var queryParameters: [String: String]? { nil }
    var body: Data? { nil }
    var headers: [String: String]? { nil }
}
