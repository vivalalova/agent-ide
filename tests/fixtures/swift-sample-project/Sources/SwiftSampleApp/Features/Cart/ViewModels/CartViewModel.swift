import Foundation
import Combine

/// 購物車 ViewModel
@MainActor
final class CartViewModel: BaseViewModel {
    /// 購物車項目
    @Published var items: [CartItem] = []

    /// 是否全選
    @Published var isAllSelected: Bool = false

    /// 優惠碼
    @Published var couponCode: String = ""

    /// 折扣金額
    @Published var discountAmount: Double = 0

    /// Cancellables
    private var cancellables = Set<AnyCancellable>()

    /// 初始化
    override init() {
        super.init()
        setupSubscriptions()
        loadCartItems()
    }

    /// 載入購物車項目
    func loadCartItems() {
        Logger.shared.log("Loading cart items", level: .debug)
    }

    /// 新增項目到購物車
    func addItem(_ product: Product, quantity: Int = 1) {
        if let index = items.firstIndex(where: { $0.product.id == product.id }) {
            items[index].quantity += quantity
        } else {
            let item = CartItem(product: product, quantity: quantity)
            items.append(item)
        }
        Logger.shared.log("Added \(quantity) x \(product.name) to cart", level: .info)
    }

    /// 移除項目
    func removeItem(_ item: CartItem) {
        items.removeAll { $0.id == item.id }
        Logger.shared.log("Removed item from cart", level: .info)
    }

    /// 更新項目數量
    func updateQuantity(for item: CartItem, quantity: Int) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        items[index].quantity = max(1, min(quantity, item.product.stockQuantity))
    }

    /// 增加數量
    func increaseQuantity(for item: CartItem) {
        guard item.canIncreaseQuantity else { return }
        updateQuantity(for: item, quantity: item.quantity + 1)
    }

    /// 減少數量
    func decreaseQuantity(for item: CartItem) {
        updateQuantity(for: item, quantity: item.quantity - 1)
    }

    /// 切換項目選擇狀態
    func toggleSelection(for item: CartItem) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        items[index].isSelected.toggle()
    }

    /// 切換全選
    func toggleSelectAll() {
        isAllSelected.toggle()
        for index in items.indices {
            items[index].isSelected = isAllSelected
        }
    }

    /// 應用優惠碼
    func applyCoupon() async {
        guard !couponCode.isEmpty else { return }

        isLoading = true

        do {
            await Task.sleep(1_000_000_000)
            discountAmount = subtotal * 0.1
            Logger.shared.log("Coupon applied: \(couponCode)", level: .info)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    /// 清空購物車
    func clearCart() {
        items.removeAll()
        couponCode = ""
        discountAmount = 0
        Logger.shared.log("Cart cleared", level: .info)
    }

    /// 已選項目
    var selectedItems: [CartItem] {
        items.filter { $0.isSelected }
    }

    /// 已選項目數量
    var selectedItemCount: Int {
        selectedItems.reduce(0) { $0 + $1.quantity }
    }

    /// 小計
    var subtotal: Double {
        selectedItems.reduce(0) { $0 + $1.subtotal }
    }

    /// 運費
    var shippingFee: Double {
        subtotal >= 1000 ? 0 : 60
    }

    /// 總計
    var total: Double {
        subtotal - discountAmount + shippingFee
    }

    /// 格式化小計
    var formattedSubtotal: String {
        String(format: "$%.2f", subtotal)
    }

    /// 格式化折扣
    var formattedDiscount: String {
        String(format: "$%.2f", discountAmount)
    }

    /// 格式化運費
    var formattedShippingFee: String {
        shippingFee == 0 ? "免運費" : String(format: "$%.2f", shippingFee)
    }

    /// 格式化總計
    var formattedTotal: String {
        String(format: "$%.2f", total)
    }

    /// 是否可以結帳
    var canCheckout: Bool {
        !selectedItems.isEmpty && selectedItems.allSatisfy { $0.product.isInStock }
    }

    /// 設定訂閱
    private func setupSubscriptions() {
        $items
            .map { items in
                !items.isEmpty && items.allSatisfy { $0.isSelected }
            }
            .assign(to: &$isAllSelected)
    }
}
