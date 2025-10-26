import Foundation

/// 購物車項目
struct CartItem: Codable, Identifiable {
    /// 項目 ID
    let id: String

    /// 產品
    let product: Product

    /// 數量
    var quantity: Int

    /// 是否選中
    var isSelected: Bool

    /// 加入時間
    let addedAt: Date

    /// 小計
    var subtotal: Double {
        product.price * Double(quantity)
    }

    /// 格式化小計
    var formattedSubtotal: String {
        String(format: "$%.2f", subtotal)
    }

    /// 是否可以增加數量
    var canIncreaseQuantity: Bool {
        quantity < product.stockQuantity
    }

    /// 初始化
    init(id: String = UUID().uuidString, product: Product, quantity: Int = 1, isSelected: Bool = true, addedAt: Date = Date()) {
        self.id = id
        self.product = product
        self.quantity = quantity
        self.isSelected = isSelected
        self.addedAt = addedAt
    }
}
