import Foundation

struct Product: Identifiable, Codable {
    let id: UUID
    let name: String
    let price: Double
    let category: String
    let stock: Int
    let description: String?

    init(id: UUID = UUID(), name: String, price: Double, category: String, stock: Int, description: String? = nil) {
        self.id = id
        self.name = name
        self.price = price
        self.category = category
        self.stock = stock
        self.description = description
    }

    // 行 21-23：可用性檢查（computed property，測試提取點）
    var isAvailable: Bool {
        return stock > 0
    }

    var formattedPrice: String {
        String(format: "$%.2f", price)
    }
}
