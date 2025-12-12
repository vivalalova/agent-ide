import Foundation

/// 產品模型
public class Product {
    public let id: UUID
    public var name: String
    public var price: Decimal
    public var description: String?

    public init(id: UUID = UUID(), name: String, price: Decimal) {
        self.id = id
        self.name = name
        self.price = price
    }

    /// 計算折扣價格
    public func discountedPrice(discount: Decimal) -> Decimal {
        return price * (1 - discount)
    }
}

/// 產品分類
public struct Category: Identifiable {
    public let id: UUID
    public var name: String
    public var products: [Product]

    public init(id: UUID = UUID(), name: String, products: [Product] = []) {
        self.id = id
        self.name = name
        self.products = products
    }
}
