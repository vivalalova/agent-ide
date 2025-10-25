import Foundation

/// 訂單資料模型
struct Order: Codable, Identifiable {
    /// 訂單 ID
    let id: String

    /// 訂單編號
    let orderNumber: String

    /// 使用者 ID
    let userId: String

    /// 訂單項目
    let items: [OrderItem]

    /// 訂單狀態
    var status: OrderStatus

    /// 小計
    let subtotal: Double

    /// 運費
    let shippingFee: Double

    /// 折扣金額
    let discount: Double

    /// 稅金
    let tax: Double

    /// 總金額
    let total: Double

    /// 收件人資訊
    let shippingAddress: ShippingAddress

    /// 付款方式
    let paymentMethod: PaymentMethod

    /// 訂單備註
    let notes: String?

    /// 建立時間
    let createdAt: Date

    /// 更新時間
    var updatedAt: Date

    /// 預計送達時間
    let estimatedDeliveryDate: Date?

    /// 實際送達時間
    var actualDeliveryDate: Date?

    /// 計算商品總數
    var totalItemCount: Int {
        items.reduce(0) { $0 + $1.quantity }
    }

    /// 格式化總金額
    var formattedTotal: String {
        String(format: "$%.2f", total)
    }

    /// 是否可以取消
    var canCancel: Bool {
        status == .pending || status == .processing
    }

    /// CodingKeys for JSON mapping
    enum CodingKeys: String, CodingKey {
        case id
        case orderNumber = "order_number"
        case userId = "user_id"
        case items
        case status
        case subtotal
        case shippingFee = "shipping_fee"
        case discount
        case tax
        case total
        case shippingAddress = "shipping_address"
        case paymentMethod = "payment_method"
        case notes
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case estimatedDeliveryDate = "estimated_delivery_date"
        case actualDeliveryDate = "actual_delivery_date"
    }
}

/// 訂單項目
struct OrderItem: Codable, Identifiable {
    /// 項目 ID
    let id: String

    /// 產品 ID
    let productId: String

    /// 產品名稱
    let productName: String

    /// 產品圖片 URL
    let productImageURL: String

    /// 單價
    let unitPrice: Double

    /// 數量
    let quantity: Int

    /// 小計
    var subtotal: Double {
        unitPrice * Double(quantity)
    }

    /// 格式化小計
    var formattedSubtotal: String {
        String(format: "$%.2f", subtotal)
    }

    /// CodingKeys for JSON mapping
    enum CodingKeys: String, CodingKey {
        case id
        case productId = "product_id"
        case productName = "product_name"
        case productImageURL = "product_image_url"
        case unitPrice = "unit_price"
        case quantity
    }
}

/// 訂單狀態
enum OrderStatus: String, Codable {
    case pending = "pending"
    case processing = "processing"
    case shipped = "shipped"
    case delivered = "delivered"
    case cancelled = "cancelled"
    case refunded = "refunded"

    /// 狀態顯示名稱
    var displayName: String {
        switch self {
        case .pending: return "待處理"
        case .processing: return "處理中"
        case .shipped: return "已出貨"
        case .delivered: return "已送達"
        case .cancelled: return "已取消"
        case .refunded: return "已退款"
        }
    }

    /// 狀態顏色
    var color: String {
        switch self {
        case .pending: return "orange"
        case .processing: return "blue"
        case .shipped: return "purple"
        case .delivered: return "green"
        case .cancelled: return "red"
        case .refunded: return "gray"
        }
    }
}

/// 收件人地址
struct ShippingAddress: Codable {
    /// 收件人姓名
    let recipientName: String

    /// 電話
    let phone: String

    /// 郵遞區號
    let zipCode: String

    /// 城市
    let city: String

    /// 區域
    let district: String

    /// 詳細地址
    let addressLine: String

    /// 完整地址
    var fullAddress: String {
        "\(zipCode) \(city)\(district)\(addressLine)"
    }

    /// CodingKeys for JSON mapping
    enum CodingKeys: String, CodingKey {
        case recipientName = "recipient_name"
        case phone
        case zipCode = "zip_code"
        case city
        case district
        case addressLine = "address_line"
    }
}

/// 付款方式
enum PaymentMethod: String, Codable {
    case creditCard = "credit_card"
    case debitCard = "debit_card"
    case cash = "cash"
    case bankTransfer = "bank_transfer"
    case mobilePay = "mobile_pay"

    /// 付款方式顯示名稱
    var displayName: String {
        switch self {
        case .creditCard: return "信用卡"
        case .debitCard: return "金融卡"
        case .cash: return "貨到付款"
        case .bankTransfer: return "銀行轉帳"
        case .mobilePay: return "行動支付"
        }
    }

    /// 圖示
    var icon: String {
        switch self {
        case .creditCard: return "creditcard.fill"
        case .debitCard: return "creditcard"
        case .cash: return "banknote.fill"
        case .bankTransfer: return "building.columns.fill"
        case .mobilePay: return "applelogo"
        }
    }
}
