import Foundation

/// Order service errors
enum OrderServiceError: Error {
    case orderNotFound
    case cannotCancel
    case invalidStatus
    case emptyOrder
}

/// Order service protocol
protocol OrderServiceProtocol {
    func getOrder(id: String) async throws -> Order
    func getOrdersByUser(userId: String) async throws -> [Order]
    func createOrder(userId: String, items: [OrderItem]) async throws -> Order
    func updateOrderStatus(orderId: String, status: OrderStatus) async throws -> Order
    func cancelOrder(id: String) async throws -> Order
}

/// Order service implementation
final class OrderService: OrderServiceProtocol {
    /// Simulated orders storage
    private var orders: [String: Order] = [:]

    /// Get order by ID
    func getOrder(id: String) async throws -> Order {
        guard let order = orders[id] else {
            throw OrderServiceError.orderNotFound
        }
        return order
    }

    /// Get orders by user
    func getOrdersByUser(userId: String) async throws -> [Order] {
        orders.values.filter { $0.userId == userId }
    }

    /// Create new order
    func createOrder(userId: String, items: [OrderItem]) async throws -> Order {
        guard !items.isEmpty else {
            throw OrderServiceError.emptyOrder
        }

        let now = Date()
        let order = Order(
            id: UUID().uuidString,
            userId: userId,
            items: items,
            status: .pending,
            createdAt: now,
            updatedAt: now
        )
        orders[order.id] = order
        return order
    }

    /// Update order status
    func updateOrderStatus(orderId: String, status: OrderStatus) async throws -> Order {
        guard var order = orders[orderId] else {
            throw OrderServiceError.orderNotFound
        }

        order.status = status
        order.updatedAt = Date()
        orders[orderId] = order
        return order
    }

    /// Cancel order
    func cancelOrder(id: String) async throws -> Order {
        guard var order = orders[id] else {
            throw OrderServiceError.orderNotFound
        }

        guard order.canCancel else {
            throw OrderServiceError.cannotCancel
        }

        order.status = .cancelled
        order.updatedAt = Date()
        orders[id] = order
        return order
    }
}
