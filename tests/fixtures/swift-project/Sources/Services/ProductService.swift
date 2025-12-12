import Foundation

/// 產品服務
public class ProductService {
    private var products: [UUID: Product] = [:]

    public init() {}

    /// 建立產品
    public func createProduct(name: String, price: Decimal) -> Product {
        let product = Product(name: name, price: price)
        products[product.id] = product
        return product
    }

    /// 取得產品
    public func getProduct(id: UUID) -> Product? {
        return products[id]
    }

    /// 計算購物車總價
    public func calculateTotal(productIds: [UUID]) -> Decimal {
        return productIds.compactMap { products[$0]?.price }.reduce(0, +)
    }
}
