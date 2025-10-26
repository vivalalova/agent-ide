import Foundation
import Combine

/// 訂單 ViewModel（高複雜度業務邏輯）
@MainActor
final class OrderViewModel: BaseViewModel {
    /// 訂單列表
    @Published var orders: [Order] = []

    /// 篩選狀態
    @Published var filterStatus: OrderStatus?

    /// 排序方式
    @Published var sortOption: OrderSortOption = .dateDescending

    /// 當前頁碼
    @Published var currentPage: Int = 1

    /// 是否有更多資料
    @Published var hasMorePages: Bool = true

    /// 總訂單金額統計
    @Published var totalOrderValue: Double = 0

    /// 訂單統計資訊
    @Published var statistics: OrderStatistics?

    /// 訂單服務
    private let orderService: OrderServiceProtocol

    /// 產品服務
    private let productService: ProductServiceProtocol

    /// Cancellables
    private var cancellables = Set<AnyCancellable>()

    /// 初始化
    init(orderService: OrderServiceProtocol, productService: ProductServiceProtocol) {
        self.orderService = orderService
        self.productService = productService
        super.init()
        setupSubscriptions()
        Task {
            await loadOrders()
            await calculateStatistics()
        }
    }

    /// 載入訂單列表
    func loadOrders(refresh: Bool = false) async {
        if refresh {
            currentPage = 1
            orders = []
        }

        guard hasMorePages else { return }

        isLoading = true
        errorMessage = nil

        do {
            var newOrders = try await orderService.fetchOrders(page: currentPage, pageSize: 20)

            newOrders = applyFiltersAndSorting(to: newOrders)

            if refresh {
                orders = newOrders
            } else {
                orders.append(contentsOf: newOrders)
            }

            hasMorePages = newOrders.count >= 20
            currentPage += 1

            await calculateTotalValue()
        } catch {
            errorMessage = error.localizedDescription
            Logger.shared.error(error)
        }

        isLoading = false
    }

    /// 取消訂單
    func cancelOrder(_ order: Order) async {
        guard order.canCancel else {
            errorMessage = "此訂單無法取消"
            return
        }

        isLoading = true

        do {
            try await orderService.cancelOrder(id: order.id)

            if let index = orders.firstIndex(where: { $0.id == order.id }) {
                orders[index].status = .cancelled
                orders[index].updatedAt = Date()
            }

            await calculateStatistics()
            Logger.shared.log("Order cancelled: \(order.orderNumber)", level: .info)
        } catch {
            errorMessage = error.localizedDescription
            Logger.shared.error(error)
        }

        isLoading = false
    }

    /// 應用篩選和排序
    private func applyFiltersAndSorting(to orders: [Order]) -> [Order] {
        var filteredOrders = orders

        if let status = filterStatus {
            filteredOrders = filteredOrders.filter { $0.status == status }
        }

        switch sortOption {
        case .dateDescending:
            filteredOrders.sort { $0.createdAt > $1.createdAt }
        case .dateAscending:
            filteredOrders.sort { $0.createdAt < $1.createdAt }
        case .amountDescending:
            filteredOrders.sort { $0.total > $1.total }
        case .amountAscending:
            filteredOrders.sort { $0.total < $1.total }
        case .statusPriority:
            filteredOrders.sort { getStatusPriority($0.status) < getStatusPriority($1.status) }
        }

        return filteredOrders
    }

    /// 取得狀態優先級（用於排序）
    private func getStatusPriority(_ status: OrderStatus) -> Int {
        switch status {
        case .pending: return 1
        case .processing: return 2
        case .shipped: return 3
        case .delivered: return 4
        case .cancelled: return 5
        case .refunded: return 6
        }
    }

    /// 計算總訂單金額
    private func calculateTotalValue() async {
        let activeOrders = orders.filter { order in
            order.status != .cancelled && order.status != .refunded
        }
        totalOrderValue = activeOrders.reduce(0) { $0 + $1.total }
    }

    /// 計算訂單統計資訊
    func calculateStatistics() async {
        let totalOrders = orders.count
        let pendingCount = orders.filter { $0.status == .pending }.count
        let processingCount = orders.filter { $0.status == .processing }.count
        let shippedCount = orders.filter { $0.status == .shipped }.count
        let deliveredCount = orders.filter { $0.status == .delivered }.count
        let cancelledCount = orders.filter { $0.status == .cancelled }.count

        let totalRevenue = orders
            .filter { $0.status != .cancelled && $0.status != .refunded }
            .reduce(0) { $0 + $1.total }

        let averageOrderValue = totalOrders > 0 ? totalRevenue / Double(totalOrders) : 0

        let totalItems = orders.reduce(0) { $0 + $1.totalItemCount }

        let completionRate = totalOrders > 0
            ? Double(deliveredCount) / Double(totalOrders) * 100
            : 0

        let cancellationRate = totalOrders > 0
            ? Double(cancelledCount) / Double(totalOrders) * 100
            : 0

        statistics = OrderStatistics(
            totalOrders: totalOrders,
            pendingCount: pendingCount,
            processingCount: processingCount,
            shippedCount: shippedCount,
            deliveredCount: deliveredCount,
            cancelledCount: cancelledCount,
            totalRevenue: totalRevenue,
            averageOrderValue: averageOrderValue,
            totalItems: totalItems,
            completionRate: completionRate,
            cancellationRate: cancellationRate
        )
    }

    /// 計算訂單折扣（複雜業務邏輯範例）
    func calculateDiscount(for order: Order) -> Double {
        var discount: Double = 0

        if order.items.count >= 5 {
            discount += order.subtotal * 0.05
        }

        if order.subtotal >= 1000 {
            discount += 50
        } else if order.subtotal >= 500 {
            discount += 20
        }

        let hasElectronics = order.items.contains { item in
            item.productName.lowercased().contains("電子")
        }
        if hasElectronics && order.items.count > 1 {
            discount += order.subtotal * 0.03
        }

        let dayOfWeek = Calendar.current.component(.weekday, from: order.createdAt)
        if dayOfWeek == 1 || dayOfWeek == 7 {
            discount += order.subtotal * 0.02
        }

        return min(discount, order.subtotal * 0.3)
    }

    /// 計算運費（複雜業務邏輯範例）
    func calculateShippingFee(for order: Order) -> Double {
        let baseShippingFee: Double = 60

        if order.subtotal >= 1000 {
            return 0
        }

        let totalWeight = Double(order.totalItemCount) * 0.5
        var shippingFee = baseShippingFee

        if totalWeight > 10 {
            shippingFee += (totalWeight - 10) * 5
        }

        let isRemoteArea = ["花蓮", "台東", "澎湖", "金門", "馬祖"].contains(order.shippingAddress.city)
        if isRemoteArea {
            shippingFee += 100
        }

        return shippingFee
    }

    /// 設定訂閱
    private func setupSubscriptions() {
        Publishers.CombineLatest($filterStatus, $sortOption)
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] _, _ in
                guard let self = self else { return }
                Task {
                    await self.loadOrders(refresh: true)
                }
            }
            .store(in: &cancellables)
    }
}

/// 訂單排序選項
enum OrderSortOption: String, CaseIterable {
    case dateDescending = "date_desc"
    case dateAscending = "date_asc"
    case amountDescending = "amount_desc"
    case amountAscending = "amount_asc"
    case statusPriority = "status_priority"

    /// 顯示名稱
    var displayName: String {
        switch self {
        case .dateDescending: return "日期（新到舊）"
        case .dateAscending: return "日期（舊到新）"
        case .amountDescending: return "金額（高到低）"
        case .amountAscending: return "金額（低到高）"
        case .statusPriority: return "狀態優先"
        }
    }
}

/// 訂單統計資訊
struct OrderStatistics {
    let totalOrders: Int
    let pendingCount: Int
    let processingCount: Int
    let shippedCount: Int
    let deliveredCount: Int
    let cancelledCount: Int
    let totalRevenue: Double
    let averageOrderValue: Double
    let totalItems: Int
    let completionRate: Double
    let cancellationRate: Double

    /// 格式化總收入
    var formattedTotalRevenue: String {
        String(format: "$%.2f", totalRevenue)
    }

    /// 格式化平均訂單金額
    var formattedAverageOrderValue: String {
        String(format: "$%.2f", averageOrderValue)
    }
}
