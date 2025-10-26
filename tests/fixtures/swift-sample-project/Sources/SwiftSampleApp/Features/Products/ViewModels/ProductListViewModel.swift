import Foundation
import Combine

/// 產品列表 ViewModel
@MainActor
final class ProductListViewModel: BaseViewModel {
    /// 產品列表
    @Published var products: [Product] = []

    /// 精選產品
    @Published var featuredProducts: [Product] = []

    /// 搜尋關鍵字
    @Published var searchQuery: String = ""

    /// 選擇的類別
    @Published var selectedCategory: ProductCategory?

    /// 當前頁碼
    @Published var currentPage: Int = 1

    /// 是否有更多資料
    @Published var hasMorePages: Bool = true

    /// 產品服務
    private let productService: ProductServiceProtocol

    /// Cancellables
    private var cancellables = Set<AnyCancellable>()

    /// 初始化
    init(productService: ProductServiceProtocol) {
        self.productService = productService
        super.init()
        setupSearchDebounce()
        Task {
            await loadInitialData()
        }
    }

    /// 載入初始資料
    func loadInitialData() async {
        async let productsTask = loadProducts()
        async let featuredTask = loadFeaturedProducts()
        await productsTask
        await featuredTask
    }

    /// 載入產品列表
    func loadProducts(refresh: Bool = false) async {
        if refresh {
            currentPage = 1
            products = []
        }

        guard hasMorePages else { return }

        isLoading = true
        errorMessage = nil

        do {
            let newProducts = try await productService.fetchProducts(page: currentPage, pageSize: 20)

            if refresh {
                products = newProducts
            } else {
                products.append(contentsOf: newProducts)
            }

            hasMorePages = newProducts.count >= 20
            currentPage += 1
        } catch {
            errorMessage = error.localizedDescription
            Logger.shared.error(error)
        }

        isLoading = false
    }

    /// 載入精選產品
    func loadFeaturedProducts() async {
        do {
            featuredProducts = try await productService.fetchFeaturedProducts()
        } catch {
            Logger.shared.error(error)
        }
    }

    /// 搜尋產品
    func searchProducts() async {
        guard !searchQuery.isEmpty else {
            await loadProducts(refresh: true)
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            products = try await productService.searchProducts(query: searchQuery)
            hasMorePages = false
        } catch {
            errorMessage = error.localizedDescription
            Logger.shared.error(error)
        }

        isLoading = false
    }

    /// 篩選類別
    func filterByCategory(_ category: ProductCategory?) async {
        selectedCategory = category
        await loadProducts(refresh: true)
    }

    /// 設定搜尋去抖動
    private func setupSearchDebounce() {
        $searchQuery
            .debounce(for: .milliseconds(500), scheduler: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self = self else { return }
                Task {
                    await self.searchProducts()
                }
            }
            .store(in: &cancellables)
    }
}
