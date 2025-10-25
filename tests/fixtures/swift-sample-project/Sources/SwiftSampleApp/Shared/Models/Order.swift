import Foundation

/// 訂單資料模型
struct Order: Codable, Identifiable {
    /// 訂單唯一識別碼
    let id: String

    /// 使用者 ID
    let userId: String

    /// 訂單項目
    let items: [OrderItem]

    /// 訂單狀態
    var status: OrderStatus

    /// 總金額
    let totalAmount: Decimal

    /// 建立時間
    let createdAt: Date

    /// 更新時間
    var updatedAt: Date?

    /// 運送地址
    let shippingAddress: Address?

    /// CodingKeys for JSON mapping
    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case items
        case status
        case totalAmount = "total_amount"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case shippingAddress = "shipping_address"
    }
}

/// 訂單項目
struct OrderItem: Codable {
    /// 產品 ID
    let productId: String

    /// 產品名稱
    let productName: String

    /// 數量
    let quantity: Int

    /// 單價
    let unitPrice: Decimal

    /// 小計
    var subtotal: Decimal {
        unitPrice * Decimal(quantity)
    }

    enum CodingKeys: String, CodingKey {
        case productId = "product_id"
        case productName = "product_name"
        case quantity
        case unitPrice = "unit_price"
    }
}

/// 訂單狀態
enum OrderStatus: String, Codable {
    case pending = "pending"
    case processing = "processing"
    case shipped = "shipped"
    case delivered = "delivered"
    case cancelled = "cancelled"

    /// 狀態顯示名稱
    var displayName: String {
        switch self {
        case .pending: return "待處理"
        case .processing: return "處理中"
        case .shipped: return "已出貨"
        case .delivered: return "已送達"
        case .cancelled: return "已取消"
        }
    }
}

/// 運送地址
struct Address: Codable {
    let street: String
    let city: String
    let state: String
    let zipCode: String
    let country: String

    enum CodingKeys: String, CodingKey {
        case street
        case city
        case state
        case zipCode = "zip_code"
        case country
    }
}
