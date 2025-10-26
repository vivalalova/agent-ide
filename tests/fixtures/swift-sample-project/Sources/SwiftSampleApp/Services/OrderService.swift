import Foundation

actor OrderService {
    private let networkService: NetworkService

    init(networkService: NetworkService) {
        self.networkService = networkService
    }

    func fetchOrders() async throws -> [Order] {
        let endpoint = APIEndpoint.orders
        let request = try buildRequest(for: endpoint)
        let data = try await networkService.fetch(request)
        return try JSONDecoder().decode([Order].self, from: data)
    }

    // 行 20-28：建立訂單（測試提取點）
    func createOrder(items: [CartItem]) async throws -> Order {
        guard !items.isEmpty else {
            throw OrderError.emptyCart
        }

        let total = calculateTotal(items: items)
        let orderData = OrderData(items: items, total: total)

        let data = try await submitOrder(orderData)
        return try JSONDecoder().decode(Order.self, from: data)
    }

    // 行 36-40：價格計算（測試提取點）
    private func calculateTotal(items: [CartItem]) -> Double {
        return items.reduce(0.0) { total, item in
            total + (item.price * Double(item.quantity))
        }
    }

    private func buildRequest(for endpoint: APIEndpoint) throws -> URLRequest {
        return URLRequest(url: endpoint.url)
    }

    private func submitOrder(_ orderData: OrderData) async throws -> Data {
        let endpoint = APIEndpoint.createOrder
        let request = try buildRequest(for: endpoint)
        return try await networkService.fetch(request)
    }
}

struct OrderData {
    let items: [CartItem]
    let total: Double
}

enum OrderError: Error {
    case emptyCart
    case invalidTotal
}
