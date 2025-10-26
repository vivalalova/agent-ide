import Foundation

/// 網路服務協定
protocol NetworkServiceProtocol {
    func request<T: Codable>(_ endpoint: APIEndpoint) async throws -> T
    func requestWithResponse<T: Codable>(_ endpoint: APIEndpoint) async throws -> APIResponse<T>
    func upload(data: Data, to endpoint: APIEndpoint) async throws -> Data
}

/// 網路服務實作
final class NetworkService: NetworkServiceProtocol {
    /// URLSession 實例
    private let session: URLSession

    /// 請求重試管理器
    private let retryManager: RequestRetryManager

    /// 初始化
    init(session: URLSession = .shared) {
        self.session = session
        self.retryManager = RequestRetryManager()
    }

    /// 執行網路請求
    func request<T: Codable>(_ endpoint: APIEndpoint) async throws -> T {
        let response: APIResponse<T> = try await requestWithResponse(endpoint)

        guard response.success, let data = response.data else {
            throw NetworkError.serverError(statusCode: response.statusCode)
        }

        return data
    }

    /// 執行網路請求並回傳完整回應
    func requestWithResponse<T: Codable>(_ endpoint: APIEndpoint) async throws -> APIResponse<T> {
        let request = try endpoint.asURLRequest()

        Logger.shared.logNetworkRequest(
            url: request.url?.absoluteString ?? "",
            method: request.httpMethod ?? "",
            headers: request.allHTTPHeaderFields
        )

        do {
            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw NetworkError.unknown(NSError(domain: "NetworkService", code: -1))
            }

            Logger.shared.logNetworkResponse(
                url: request.url?.absoluteString ?? "",
                statusCode: httpResponse.statusCode,
                data: data
            )

            try validateResponse(httpResponse)

            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let apiResponse = try decoder.decode(APIResponse<T>.self, from: data)

            return apiResponse
        } catch let error as NetworkError {
            throw error
        } catch {
            throw NetworkError.unknown(error)
        }
    }

    /// 上傳資料
    func upload(data: Data, to endpoint: APIEndpoint) async throws -> Data {
        var request = try endpoint.asURLRequest()
        request.httpBody = data

        let (responseData, response) = try await session.upload(for: request, from: data)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.unknown(NSError(domain: "NetworkService", code: -1))
        }

        try validateResponse(httpResponse)
        return responseData
    }

    /// 驗證 HTTP 回應
    private func validateResponse(_ response: HTTPURLResponse) throws {
        switch response.statusCode {
        case 200...299:
            return
        case 401:
            throw NetworkError.unauthorized
        case 403:
            throw NetworkError.forbidden
        case 404:
            throw NetworkError.notFound
        case 408:
            throw NetworkError.requestTimeout
        case 429:
            throw NetworkError.rateLimitExceeded
        case 500...599:
            throw NetworkError.serverError(statusCode: response.statusCode)
        default:
            throw NetworkError.serverError(statusCode: response.statusCode)
        }
    }
}

/// 請求重試管理器
final class RequestRetryManager {
    /// 重試請求
    func retry<T>(maxAttempts: Int = APIConstants.maxRetryCount, delay: TimeInterval = APIConstants.retryDelay, operation: () async throws -> T) async throws -> T {
        var lastError: Error?

        for attempt in 1...maxAttempts {
            do {
                return try await operation()
            } catch let error as NetworkError where error.isRetryable {
                lastError = error
                Logger.shared.log("Request failed (attempt \(attempt)/\(maxAttempts)): \(error.localizedDescription)", level: .warning)

                if attempt < maxAttempts {
                    try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                }
            } catch {
                throw error
            }
        }

        throw lastError ?? NetworkError.unknown(NSError(domain: "RequestRetryManager", code: -1))
    }
}
