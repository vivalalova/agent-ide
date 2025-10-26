import Foundation
import Combine

@MainActor
class OrderViewModel: ObservableObject {
    @Published var orders: [Order] = []
    @Published var cartItems: [CartItem] = []
    @Published var totalPrice: Double = 0
    @Published var isProcessing = false

    private let orderService: OrderService
    private var cancellables = Set<AnyCancellable>()

    init(orderService: OrderService) {
        self.orderService = orderService
        setupSubscriptions()
    }

    private func setupSubscriptions() {
        $cartItems
            .map { items in
                items.reduce(0.0) { $0 + $1.price * Double($1.quantity) }
            }
            .assign(to: &$totalPrice)
    }

    // 行 38-42：添加購物車項目（測試外部變數引用）
    func addToCart(item: Product) {
        let cartItem = CartItem(product: item, quantity: 1)
        cartItems.append(cartItem)
        updateTotal()
    }

    // 行 44-50：結帳流程（包含 guard）
    func checkout() async {
        guard !cartItems.isEmpty else {
            print("Cart is empty")
            return
        }
        guard totalPrice > 0 else { return }

        isProcessing = true
        // Process checkout
    }

    // 行 51-54：計算總額（測試提取點）
    private func updateTotal() {
        totalPrice = cartItems.reduce(0.0) { total, item in
            total + (item.price * Double(item.quantity))
        }
    }
}

struct Order: Identifiable, Codable {
    let id: UUID
    let items: [CartItem]
    let total: Double
    let createdAt: Date
}

struct CartItem: Identifiable, Codable {
    let id: UUID
    let product: Product
    var quantity: Int

    var price: Double {
        product.price
    }

    init(id: UUID = UUID(), product: Product, quantity: Int) {
        self.id = id
        self.product = product
        self.quantity = quantity
    }
}
