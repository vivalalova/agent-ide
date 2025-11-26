import Foundation

/// Order status
enum OrderStatus: String, Codable {
    case pending
    case processing
    case shipped
    case delivered
    case cancelled
}

/// Order item
struct OrderItem: Codable, Identifiable {
    /// Item ID
    let id: String
    /// Product ID
    let productId: String
    /// Product name
    let productName: String
    /// Quantity
    let quantity: Int
    /// Unit price in cents
    let unitPrice: Int

    /// Total price for this item
    var totalPrice: Int {
        quantity * unitPrice
    }
}

/// Order model
struct Order: Codable, Identifiable {
    /// Order ID
    let id: String
    /// User ID
    let userId: String
    /// Order items
    let items: [OrderItem]
    /// Order status
    var status: OrderStatus
    /// Created date
    let createdAt: Date
    /// Updated date
    var updatedAt: Date

    /// Total order amount
    var totalAmount: Int {
        items.reduce(0) { $0 + $1.totalPrice }
    }

    /// Formatted total
    var formattedTotal: String {
        let dollars = Double(totalAmount) / 100.0
        return String(format: "$%.2f", dollars)
    }

    /// Check if order can be cancelled
    var canCancel: Bool {
        status == .pending || status == .processing
    }
}
