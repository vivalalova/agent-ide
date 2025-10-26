import Foundation

/// 訂單服務實作
final class OrderService: OrderServiceProtocol {
    /// 網路服務
    private let networkService: NetworkServiceProtocol

    /// 初始化
    init(networkService: NetworkServiceProtocol) {
        self.networkService = networkService
    }

    /// 取得訂單列表
    func fetchOrders(page: Int, pageSize: Int) async throws -> [Order] {
        let endpoint = OrderListEndpoint(page: page, pageSize: pageSize)
        let response: [Order] = try await networkService.request(endpoint)
        Logger.shared.log("Fetched \(response.count) orders", level: .info)
        return response
    }

    /// 取得訂單詳情
    func fetchOrder(id: String) async throws -> Order {
        let endpoint = OrderDetailEndpoint(orderId: id)
        let order: Order = try await networkService.request(endpoint)
        Logger.shared.log("Fetched order: \(order.orderNumber)", level: .info)
        return order
    }

    /// 建立訂單
    func createOrder(items: [OrderItem]) async throws -> Order {
        let endpoint = CreateOrderEndpoint(items: items)
        let order: Order = try await networkService.request(endpoint)
        Logger.shared.log("Created order: \(order.orderNumber)", level: .info)
        return order
    }

    /// 取消訂單
    func cancelOrder(id: String) async throws {
        let endpoint = CancelOrderEndpoint(orderId: id)
        let _: EmptyResponse = try await networkService.request(endpoint)
        Logger.shared.log("Cancelled order: \(id)", level: .info)
    }

    /// 取得訂單歷史
    func fetchOrderHistory() async throws -> [Order] {
        let endpoint = OrderHistoryEndpoint()
        let response: [Order] = try await networkService.request(endpoint)
        Logger.shared.log("Fetched order history: \(response.count) orders", level: .info)
        return response
    }
}

/// 訂單列表端點
struct OrderListEndpoint: APIEndpoint {
    let page: Int
    let pageSize: Int

    var path: String { APIConstants.Endpoint.Order.list }
    var method: HTTPMethod { .get }
    var body: Data? { nil }
    var headers: [String: String]? { nil }

    var queryParameters: [String: String]? {
        [
            "page": "\(page)",
            "page_size": "\(pageSize)"
        ]
    }
}

/// 建立訂單端點
struct CreateOrderEndpoint: APIEndpoint {
    let items: [OrderItem]

    var path: String { APIConstants.Endpoint.Order.create }
    var method: HTTPMethod { .post }
    var queryParameters: [String: String]? { nil }
    var headers: [String: String]? { nil }

    var body: Data? {
        try? JSONEncoder().encode(["items": items])
    }
}

/// 取消訂單端點
struct CancelOrderEndpoint: APIEndpoint {
    let orderId: String

    var path: String { APIConstants.Endpoint.Order.cancel }
    var method: HTTPMethod { .post }
    var queryParameters: [String: String]? { nil }
    var headers: [String: String]? { nil }

    var body: Data? {
        try? JSONEncoder().encode(["order_id": orderId])
    }
}

/// 訂單歷史端點
struct OrderHistoryEndpoint: APIEndpoint {
    var path: String { APIConstants.Endpoint.Order.history }
    var method: HTTPMethod { .get }
    var queryParameters: [String: String]? { nil }
    var body: Data? { nil }
    var headers: [String: String]? { nil }
}

/// 空回應
struct EmptyResponse: Codable {}
