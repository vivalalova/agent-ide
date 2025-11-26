import Foundation

/// Product category
enum ProductCategory: String, Codable {
    case electronics
    case clothing
    case food
    case other
}

/// Product model
struct Product: Codable, Identifiable {
    /// Product ID
    let id: String
    /// Product name
    let name: String
    /// Product description
    let description: String
    /// Price in cents
    let price: Int
    /// Category
    let category: ProductCategory
    /// Stock quantity
    var stock: Int

    /// Formatted price
    var formattedPrice: String {
        let dollars = Double(price) / 100.0
        return String(format: "$%.2f", dollars)
    }

    /// Check if in stock
    var isInStock: Bool {
        stock > 0
    }
}
