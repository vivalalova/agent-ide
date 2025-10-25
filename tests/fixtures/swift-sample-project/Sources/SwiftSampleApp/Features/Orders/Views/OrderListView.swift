import SwiftUI

/// 訂單列表視圖
struct OrderListView: View {
    /// ViewModel
    @ObservedObject var viewModel: OrderViewModel

    /// 是否顯示統計資訊
    @State private var showStatistics = false

    var body: some View {
        NavigationView {
            ZStack {
                ScrollView {
                    VStack(spacing: 16) {
                        if let statistics = viewModel.statistics {
                            statisticsSection(statistics: statistics)
                        }

                        filterSection
                        sortSection

                        orderListSection
                    }
                    .padding()
                }

                if viewModel.isLoading && viewModel.orders.isEmpty {
                    ProgressView()
                }
            }
            .navigationTitle("訂單")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showStatistics.toggle() }) {
                        Image(systemName: "chart.bar.fill")
                    }
                }
            }
            .sheet(isPresented: $showStatistics) {
                if let statistics = viewModel.statistics {
                    OrderStatisticsView(statistics: statistics)
                }
            }
        }
    }

    /// 統計資訊區塊
    private func statisticsSection(statistics: OrderStatistics) -> some View {
        VStack(spacing: 12) {
            HStack {
                StatCard(title: "總訂單", value: "\(statistics.totalOrders)", color: .blue)
                StatCard(title: "總收入", value: statistics.formattedTotalRevenue, color: .green)
            }

            HStack {
                StatCard(title: "平均金額", value: statistics.formattedAverageOrderValue, color: .orange)
                StatCard(title: "完成率", value: String(format: "%.1f%%", statistics.completionRate), color: .purple)
            }
        }
    }

    /// 篩選區塊
    private var filterSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                FilterChip(
                    title: "全部",
                    isSelected: viewModel.filterStatus == nil,
                    action: { viewModel.filterStatus = nil }
                )

                ForEach([OrderStatus.pending, .processing, .shipped, .delivered, .cancelled], id: \.self) { status in
                    FilterChip(
                        title: status.displayName,
                        isSelected: viewModel.filterStatus == status,
                        action: { viewModel.filterStatus = status }
                    )
                }
            }
        }
    }

    /// 排序區塊
    private var sortSection: some View {
        HStack {
            Text("排序：")
                .font(.caption)
                .foregroundColor(.gray)

            Picker("排序", selection: $viewModel.sortOption) {
                ForEach(OrderSortOption.allCases, id: \.self) { option in
                    Text(option.displayName).tag(option)
                }
            }
            .pickerStyle(MenuPickerStyle())
            .font(.caption)
        }
    }

    /// 訂單列表區塊
    private var orderListSection: some View {
        LazyVStack(spacing: 12) {
            ForEach(viewModel.orders) { order in
                OrderCard(order: order, onCancel: {
                    Task {
                        await viewModel.cancelOrder(order)
                    }
                })
            }
        }
    }
}

/// 統計卡片
struct StatCard: View {
    let title: String
    let value: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption)
                .foregroundColor(.gray)
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(color.opacity(0.1))
        .cornerRadius(12)
    }
}

/// 篩選標籤
struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(isSelected ? Color.blue : Color.gray.opacity(0.1))
                .foregroundColor(isSelected ? .white : .primary)
                .cornerRadius(20)
        }
    }
}

/// 訂單卡片
struct OrderCard: View {
    let order: Order
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(order.orderNumber)
                        .font(.headline)
                    Text(order.createdAt.shortDateString)
                        .font(.caption)
                        .foregroundColor(.gray)
                }

                Spacer()

                statusBadge
            }

            Divider()

            ForEach(order.items.prefix(2)) { item in
                HStack {
                    Text(item.productName)
                        .font(.subheadline)
                    Spacer()
                    Text("x\(item.quantity)")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
            }

            if order.items.count > 2 {
                Text("還有 \(order.items.count - 2) 件商品...")
                    .font(.caption)
                    .foregroundColor(.gray)
            }

            Divider()

            HStack {
                Text("總計")
                    .font(.subheadline)
                    .foregroundColor(.gray)
                Spacer()
                Text(order.formattedTotal)
                    .font(.headline)
                    .foregroundColor(.blue)
            }

            if order.canCancel {
                Button(action: onCancel) {
                    Text("取消訂單")
                        .font(.caption)
                        .foregroundColor(.red)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(Color.red.opacity(0.1))
                        .cornerRadius(8)
                }
            }
        }
        .padding()
        .background(Color.white)
        .cardStyle()
    }

    /// 狀態徽章
    private var statusBadge: some View {
        Text(order.status.displayName)
            .font(.caption)
            .fontWeight(.medium)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(statusColor)
            .foregroundColor(.white)
            .cornerRadius(12)
    }

    /// 狀態顏色
    private var statusColor: Color {
        switch order.status {
        case .pending: return .orange
        case .processing: return .blue
        case .shipped: return .purple
        case .delivered: return .green
        case .cancelled: return .red
        case .refunded: return .gray
        }
    }
}

/// 訂單統計視圖
struct OrderStatisticsView: View {
    let statistics: OrderStatistics

    var body: some View {
        NavigationView {
            List {
                Section("訂單數量") {
                    StatRow(title: "總訂單數", value: "\(statistics.totalOrders)")
                    StatRow(title: "待處理", value: "\(statistics.pendingCount)")
                    StatRow(title: "處理中", value: "\(statistics.processingCount)")
                    StatRow(title: "已出貨", value: "\(statistics.shippedCount)")
                    StatRow(title: "已送達", value: "\(statistics.deliveredCount)")
                    StatRow(title: "已取消", value: "\(statistics.cancelledCount)")
                }

                Section("金額統計") {
                    StatRow(title: "總收入", value: statistics.formattedTotalRevenue)
                    StatRow(title: "平均訂單金額", value: statistics.formattedAverageOrderValue)
                }

                Section("績效指標") {
                    StatRow(title: "完成率", value: String(format: "%.1f%%", statistics.completionRate))
                    StatRow(title: "取消率", value: String(format: "%.1f%%", statistics.cancellationRate))
                    StatRow(title: "總商品數", value: "\(statistics.totalItems)")
                }
            }
            .navigationTitle("訂單統計")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

/// 統計行
struct StatRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
                .fontWeight(.medium)
                .foregroundColor(.blue)
        }
    }
}

#Preview {
    OrderListView(
        viewModel: OrderViewModel(
            orderService: OrderService(
                networkService: NetworkService()
            ),
            productService: ProductService(
                networkService: NetworkService()
            )
        )
    )
}
