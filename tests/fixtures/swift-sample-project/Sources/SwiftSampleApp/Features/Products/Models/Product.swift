import Foundation

/// 產品資料模型
struct Product: Codable, Identifiable {
    /// 產品 ID
    let id: String

    /// 產品名稱
    let name: String

    /// 產品描述
    let description: String

    /// 產品價格
    let price: Double

    /// 原價
    let originalPrice: Double?

    /// 產品圖片 URL
    let imageURL: String

    /// 產品類別
    let category: ProductCategory

    /// 庫存數量
    let stockQuantity: Int

    /// 是否為精選商品
    let isFeatured: Bool

    /// 評分
    let rating: Double

    /// 評論數量
    let reviewCount: Int

    /// 建立時間
    let createdAt: Date

    /// 更新時間
    let updatedAt: Date

    /// 是否有折扣
    var hasDiscount: Bool {
        guard let originalPrice = originalPrice else { return false }
        return price < originalPrice
    }

    /// 折扣百分比
    var discountPercentage: Int {
        guard let originalPrice = originalPrice, originalPrice > 0 else { return 0 }
        return Int(((originalPrice - price) / originalPrice) * 100)
    }

    /// 是否有庫存
    var isInStock: Bool {
        stockQuantity > 0
    }

    /// 格式化價格
    var formattedPrice: String {
        String(format: "$%.2f", price)
    }

    /// 格式化原價
    var formattedOriginalPrice: String? {
        guard let originalPrice = originalPrice else { return nil }
        return String(format: "$%.2f", originalPrice)
    }

    /// CodingKeys for JSON mapping
    enum CodingKeys: String, CodingKey {
        case id
        case name
        case description
        case price
        case originalPrice = "original_price"
        case imageURL = "image_url"
        case category
        case stockQuantity = "stock_quantity"
        case isFeatured = "is_featured"
        case rating
        case reviewCount = "review_count"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

/// 產品類別
enum ProductCategory: String, Codable, CaseIterable {
    case electronics = "electronics"
    case clothing = "clothing"
    case books = "books"
    case home = "home"
    case sports = "sports"
    case food = "food"

    /// 類別顯示名稱
    var displayName: String {
        switch self {
        case .electronics: return "電子產品"
        case .clothing: return "服飾"
        case .books: return "書籍"
        case .home: return "居家用品"
        case .sports: return "運動用品"
        case .food: return "食品"
        }
    }

    /// 類別圖示
    var icon: String {
        switch self {
        case .electronics: return "laptopcomputer"
        case .clothing: return "tshirt.fill"
        case .books: return "book.fill"
        case .home: return "house.fill"
        case .sports: return "sportscourt.fill"
        case .food: return "fork.knife"
        }
    }
}
