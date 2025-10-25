import Foundation
import Combine

/// 產品詳情 ViewModel
@MainActor
final class ProductDetailViewModel: BaseViewModel {
    /// 產品資訊
    @Published var product: Product?

    /// 選擇的數量
    @Published var quantity: Int = 1

    /// 是否已加入最愛
    @Published var isFavorite: Bool = false

    /// 產品服務
    private let productService: ProductServiceProtocol

    /// 產品 ID
    private let productId: String

    /// 初始化
    init(productId: String, productService: ProductServiceProtocol) {
        self.productId = productId
        self.productService = productService
        super.init()
        Task {
            await loadProduct()
        }
    }

    /// 載入產品詳情
    func loadProduct() async {
        isLoading = true
        errorMessage = nil

        do {
            product = try await productService.fetchProduct(id: productId)
            checkFavoriteStatus()
        } catch {
            errorMessage = error.localizedDescription
            Logger.shared.error(error)
        }

        isLoading = false
    }

    /// 增加數量
    func increaseQuantity() {
        guard let product = product, quantity < product.stockQuantity else { return }
        quantity += 1
    }

    /// 減少數量
    func decreaseQuantity() {
        guard quantity > 1 else { return }
        quantity -= 1
    }

    /// 加入購物車
    func addToCart() async {
        guard let product = product else { return }

        isLoading = true

        do {
            Logger.shared.log("Added \(quantity) x \(product.name) to cart", level: .info)
            await Task.sleep(1_000_000_000)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    /// 切換最愛狀態
    func toggleFavorite() {
        isFavorite.toggle()
        Logger.shared.log("Favorite status changed to: \(isFavorite)", level: .debug)
    }

    /// 檢查最愛狀態
    private func checkFavoriteStatus() {
        isFavorite = false
    }

    /// 計算總價
    var totalPrice: Double {
        guard let product = product else { return 0 }
        return product.price * Double(quantity)
    }

    /// 格式化總價
    var formattedTotalPrice: String {
        String(format: "$%.2f", totalPrice)
    }

    /// 是否可以加入購物車
    var canAddToCart: Bool {
        guard let product = product else { return false }
        return product.isInStock && quantity > 0 && quantity <= product.stockQuantity
    }
}
