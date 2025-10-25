import XCTest
@testable import SwiftSampleApp

/// 網路服務測試
final class NetworkServiceTests: XCTestCase {
    /// 待測試的服務
    var networkService: NetworkService!

    /// 設定測試環境
    override func setUp() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        let mockSession = URLSession(configuration: configuration)

        networkService = NetworkService(session: mockSession)
    }

    /// 清理測試環境
    override func tearDown() async throws {
        networkService = nil
        MockURLProtocol.mockData = nil
        MockURLProtocol.mockError = nil
        MockURLProtocol.mockStatusCode = 200
    }

    /// 測試成功的 GET 請求
    func testSuccessfulGetRequest() async throws {
        let expectedProduct = Product(
            id: "prod123",
            name: "Test Product",
            description: "Test Description",
            price: 99.99,
            originalPrice: nil,
            imageURL: "https://example.com/image.jpg",
            category: .electronics,
            stockQuantity: 10,
            isFeatured: false,
            rating: 4.5,
            reviewCount: 100,
            createdAt: Date(),
            updatedAt: Date()
        )

        let responseData = try JSONEncoder().encode(APIResponse.success(data: expectedProduct))
        MockURLProtocol.mockData = responseData
        MockURLProtocol.mockStatusCode = 200

        let endpoint = ProductDetailEndpoint(productId: "prod123")
        let product: Product = try await networkService.request(endpoint)

        XCTAssertEqual(product.id, expectedProduct.id)
        XCTAssertEqual(product.name, expectedProduct.name)
    }

    /// 測試 401 未授權錯誤
    func testUnauthorizedError() async {
        MockURLProtocol.mockStatusCode = 401

        let endpoint = ProductDetailEndpoint(productId: "prod123")

        do {
            let _: Product = try await networkService.request(endpoint)
            XCTFail("Expected unauthorized error")
        } catch let error as NetworkError {
            XCTAssertEqual(error, NetworkError.unauthorized)
        } catch {
            XCTFail("Unexpected error type")
        }
    }

    /// 測試 404 找不到資源錯誤
    func testNotFoundError() async {
        MockURLProtocol.mockStatusCode = 404

        let endpoint = ProductDetailEndpoint(productId: "nonexistent")

        do {
            let _: Product = try await networkService.request(endpoint)
            XCTFail("Expected not found error")
        } catch let error as NetworkError {
            XCTAssertEqual(error, NetworkError.notFound)
        } catch {
            XCTFail("Unexpected error type")
        }
    }

    /// 測試 500 伺服器錯誤
    func testServerError() async {
        MockURLProtocol.mockStatusCode = 500

        let endpoint = ProductDetailEndpoint(productId: "prod123")

        do {
            let _: Product = try await networkService.request(endpoint)
            XCTFail("Expected server error")
        } catch let error as NetworkError {
            if case .serverError(let statusCode) = error {
                XCTAssertEqual(statusCode, 500)
            } else {
                XCTFail("Expected server error")
            }
        } catch {
            XCTFail("Unexpected error type")
        }
    }
}

/// Mock URL Protocol
final class MockURLProtocol: URLProtocol {
    /// Mock 回應資料
    static var mockData: Data?

    /// Mock 錯誤
    static var mockError: Error?

    /// Mock 狀態碼
    static var mockStatusCode: Int = 200

    /// 是否可以處理請求
    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    /// 規範請求
    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    /// 開始載入
    override func startLoading() {
        if let error = MockURLProtocol.mockError {
            client?.urlProtocol(self, didFailWithError: error)
            return
        }

        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: MockURLProtocol.mockStatusCode,
            httpVersion: nil,
            headerFields: nil
        )!

        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)

        if let data = MockURLProtocol.mockData {
            client?.urlProtocol(self, didLoad: data)
        }

        client?.urlProtocolDidFinishLoading(self)
    }

    /// 停止載入
    override func stopLoading() {}
}
