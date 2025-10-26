import Foundation
import Combine

/// 認證服務協定
protocol AuthServiceProtocol {
    func login(email: String, password: String) async throws -> User
    func logout() async throws
    func register(username: String, email: String, password: String) async throws -> User
    func refreshToken() async throws -> String
    func validateToken() async throws -> Bool
}

/// 產品服務協定
protocol ProductServiceProtocol {
    func fetchProducts(page: Int, pageSize: Int) async throws -> [Product]
    func fetchProduct(id: String) async throws -> Product
    func searchProducts(query: String) async throws -> [Product]
    func fetchFeaturedProducts() async throws -> [Product]
}

/// 訂單服務協定
protocol OrderServiceProtocol {
    func fetchOrders(page: Int, pageSize: Int) async throws -> [Order]
    func fetchOrder(id: String) async throws -> Order
    func createOrder(items: [OrderItem]) async throws -> Order
    func cancelOrder(id: String) async throws
    func fetchOrderHistory() async throws -> [Order]
}

/// 儲存服務協定
protocol StorageServiceProtocol {
    func save<T: Codable>(_ value: T, forKey key: String) throws
    func load<T: Codable>(forKey key: String) throws -> T?
    func remove(forKey key: String) throws
    func clear() throws
}

/// 快取服務協定
protocol CacheServiceProtocol {
    func set<T: Codable>(_ value: T, forKey key: String, expiration: TimeInterval?)
    func get<T: Codable>(forKey key: String) -> T?
    func remove(forKey key: String)
    func clear()
}
