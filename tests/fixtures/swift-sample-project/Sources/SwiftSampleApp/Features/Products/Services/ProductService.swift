import Foundation

/// 產品服務實作
final class ProductService: ProductServiceProtocol {
    /// 網路服務
    private let networkService: NetworkServiceProtocol

    /// 初始化
    init(networkService: NetworkServiceProtocol) {
        self.networkService = networkService
    }

    /// 取得產品列表
    func fetchProducts(page: Int, pageSize: Int) async throws -> [Product] {
        let endpoint = ProductListEndpoint(page: page, pageSize: pageSize, category: nil, searchQuery: nil)
        let response: [Product] = try await networkService.request(endpoint)
        Logger.shared.log("Fetched \(response.count) products", level: .info)
        return response
    }

    /// 取得產品詳情
    func fetchProduct(id: String) async throws -> Product {
        let endpoint = ProductDetailEndpoint(productId: id)
        let product: Product = try await networkService.request(endpoint)
        Logger.shared.log("Fetched product: \(product.name)", level: .info)
        return product
    }

    /// 搜尋產品
    func searchProducts(query: String) async throws -> [Product] {
        let endpoint = ProductListEndpoint(page: 1, pageSize: 50, category: nil, searchQuery: query)
        let response: [Product] = try await networkService.request(endpoint)
        Logger.shared.log("Search found \(response.count) products for query: \(query)", level: .info)
        return response
    }

    /// 取得精選產品
    func fetchFeaturedProducts() async throws -> [Product] {
        let endpoint = FeaturedProductsEndpoint()
        let response: [Product] = try await networkService.request(endpoint)
        Logger.shared.log("Fetched \(response.count) featured products", level: .info)
        return response
    }
}

/// 產品詳情端點
struct ProductDetailEndpoint: APIEndpoint {
    let productId: String

    var path: String { APIConstants.Endpoint.Product.detail(id: productId) }
    var method: HTTPMethod { .get }
    var queryParameters: [String: String]? { nil }
    var body: Data? { nil }
    var headers: [String: String]? { nil }
}

/// 精選產品端點
struct FeaturedProductsEndpoint: APIEndpoint {
    var path: String { APIConstants.Endpoint.Product.featured }
    var method: HTTPMethod { .get }
    var queryParameters: [String: String]? { nil }
    var body: Data? { nil }
    var headers: [String: String]? { nil }
}
