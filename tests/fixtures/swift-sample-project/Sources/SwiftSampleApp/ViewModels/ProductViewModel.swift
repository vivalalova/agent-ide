import Foundation
import Combine

@MainActor
class ProductViewModel: ObservableObject {
    @Published var products: [Product] = []
    @Published var filteredProducts: [Product] = []
    @Published var selectedCategory: String = "All"
    @Published var isLoading = false

    private let productService: ProductService
    private var cancellables = Set<AnyCancellable>()

    init(productService: ProductService) {
        self.productService = productService
        setupSubscriptions()
    }

    private func setupSubscriptions() {
        Publishers.CombineLatest($products, $selectedCategory)
            .sink { [weak self] products, category in
                guard let self = self else { return }

                // 行 26-29：Combine map 閉包（測試 extract-closure）
                if category == "All" {
                    self.filteredProducts = products
                } else {
                    self.filteredProducts = products.filter { $0.category == category }
                }
            }
            .store(in: &cancellables)
    }

    // 行 25-30：ViewBuilder 邏輯（測試提取點）
    func buildFilteredList() -> [Product] {
        if selectedCategory == "All" {
            return products
        }
        return products.filter { $0.category == selectedCategory }
    }

    func loadProducts() async {
        isLoading = true
        do {
            products = try await productService.fetchProducts()
            isLoading = false
        } catch {
            isLoading = false
            print("Failed to load products: \(error)")
        }
    }
}

struct Product: Identifiable, Codable {
    let id: UUID
    let name: String
    let price: Double
    let category: String
    let stock: Int

    init(id: UUID = UUID(), name: String, price: Double, category: String, stock: Int) {
        self.id = id
        self.name = name
        self.price = price
        self.category = category
        self.stock = stock
    }
}
