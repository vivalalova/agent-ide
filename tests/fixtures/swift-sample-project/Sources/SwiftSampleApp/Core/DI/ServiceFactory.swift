import Foundation

/// 服務工廠
@MainActor
final class ServiceFactory {
    /// 註冊所有服務
    static func registerServices(in container: DIContainer) {
        registerNetworkService(in: container)
        registerStorageServices(in: container)
        registerAuthService(in: container)
        registerProductService(in: container)
        registerOrderService(in: container)
    }

    /// 註冊網路服務
    private static func registerNetworkService(in container: DIContainer) {
        let networkService = NetworkService()
        container.register(NetworkServiceProtocol.self, instance: networkService)
    }

    /// 註冊儲存服務
    private static func registerStorageServices(in container: DIContainer) {
        let userDefaultsManager = UserDefaultsManager()
        let keychainManager = KeychainManager()

        container.register(UserDefaultsManager.self, instance: userDefaultsManager)
        container.register(KeychainManager.self, instance: keychainManager)
    }

    /// 註冊認證服務
    private static func registerAuthService(in container: DIContainer) {
        container.register(AuthServiceProtocol.self) {
            AuthService(
                networkService: container.resolve(NetworkServiceProtocol.self),
                keychainManager: container.resolve(KeychainManager.self),
                userDefaultsManager: container.resolve(UserDefaultsManager.self)
            )
        }
    }

    /// 註冊產品服務
    private static func registerProductService(in container: DIContainer) {
        container.register(ProductServiceProtocol.self) {
            ProductService(
                networkService: container.resolve(NetworkServiceProtocol.self)
            )
        }
    }

    /// 註冊訂單服務
    private static func registerOrderService(in container: DIContainer) {
        container.register(OrderServiceProtocol.self) {
            OrderService(
                networkService: container.resolve(NetworkServiceProtocol.self)
            )
        }
    }
}
