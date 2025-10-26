import Foundation

class ProductService {
    private let networkService: NetworkService

    init(networkService: NetworkService) {
        self.networkService = networkService
    }

    func fetchProducts() async throws -> [Product] {
        let endpoint = APIEndpoint.products
        let request = try buildRequest(for: endpoint)

        let data = try await networkService.fetch(request)

        // 行 18-22：completion handler 閉包（測試 extract-closure）
        return try await withCheckedThrowingContinuation { continuation in
            do {
                let products = try JSONDecoder().decode([Product].self, from: data)
                continuation.resume(returning: products)
            } catch {
                continuation.resume(throwing: NetworkError.decodingFailed(error))
            }
        }
    }

    // 行 28-34：庫存資訊獲取（測試提取點）
    func getStockInfo(for product: Product) -> StockInfo {
        let isAvailable = product.stock > 0
        let status: StockStatus = isAvailable ? .available : .outOfStock
        return StockInfo(
            productId: product.id,
            quantity: product.stock,
            status: status
        )
    }

    private func buildRequest(for endpoint: APIEndpoint) throws -> URLRequest {
        return URLRequest(url: endpoint.url)
    }
}

struct StockInfo {
    let productId: UUID
    let quantity: Int
    let status: StockStatus
}

enum StockStatus {
    case available
    case outOfStock
    case lowStock
}
