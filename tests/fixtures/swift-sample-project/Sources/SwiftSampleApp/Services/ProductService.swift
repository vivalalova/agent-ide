import Foundation

/// Product service errors
enum ProductServiceError: Error {
    case productNotFound
    case outOfStock
    case invalidPrice
}

/// Product service protocol
protocol ProductServiceProtocol {
    func getProduct(id: String) async throws -> Product
    func getAllProducts() async throws -> [Product]
    func getProductsByCategory(_ category: ProductCategory) async throws -> [Product]
    func searchProducts(query: String) async throws -> [Product]
    func updateStock(productId: String, quantity: Int) async throws -> Product
}

/// Product service implementation
final class ProductService: ProductServiceProtocol {
    /// Simulated products storage
    private var products: [String: Product] = [:]

    /// Get product by ID
    func getProduct(id: String) async throws -> Product {
        guard let product = products[id] else {
            throw ProductServiceError.productNotFound
        }
        return product
    }

    /// Get all products
    func getAllProducts() async throws -> [Product] {
        Array(products.values)
    }

    /// Get products by category
    func getProductsByCategory(_ category: ProductCategory) async throws -> [Product] {
        products.values.filter { $0.category == category }
    }

    /// Search products by name
    func searchProducts(query: String) async throws -> [Product] {
        let lowercaseQuery = query.lowercased()
        return products.values.filter {
            $0.name.lowercased().contains(lowercaseQuery)
            || $0.description.lowercased().contains(lowercaseQuery)
        }
    }

    /// Update product stock
    func updateStock(productId: String, quantity: Int) async throws -> Product {
        guard var product = products[productId] else {
            throw ProductServiceError.productNotFound
        }

        let newStock = product.stock + quantity
        guard newStock >= 0 else {
            throw ProductServiceError.outOfStock
        }

        product.stock = newStock
        products[productId] = product
        return product
    }
}
