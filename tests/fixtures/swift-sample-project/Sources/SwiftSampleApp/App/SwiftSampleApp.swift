import SwiftUI

/// 應用程式主要入口點
@main
struct SwiftSampleApp: App {
    /// 依賴注入容器
    @StateObject private var container = DIContainer.shared

    /// 使用者狀態管理
    @StateObject private var authViewModel: LoginViewModel

    init() {
        let container = DIContainer.shared
        _authViewModel = StateObject(wrappedValue: LoginViewModel(
            authService: container.resolve(AuthServiceProtocol.self)
        ))
    }

    var body: some Scene {
        WindowGroup {
            if authViewModel.isAuthenticated {
                MainTabView()
                    .environmentObject(container)
            } else {
                LoginView(viewModel: authViewModel)
                    .environmentObject(container)
            }
        }
    }
}

/// 主要 Tab 導航視圖
struct MainTabView: View {
    @EnvironmentObject var container: DIContainer

    var body: some View {
        TabView {
            ProductListView(
                viewModel: ProductListViewModel(
                    productService: container.resolve(ProductServiceProtocol.self)
                )
            )
            .tabItem {
                Label("Products", systemImage: "bag.fill")
            }

            OrderListView(
                viewModel: OrderViewModel(
                    orderService: container.resolve(OrderServiceProtocol.self),
                    productService: container.resolve(ProductServiceProtocol.self)
                )
            )
            .tabItem {
                Label("Orders", systemImage: "list.bullet.rectangle")
            }
        }
    }
}
