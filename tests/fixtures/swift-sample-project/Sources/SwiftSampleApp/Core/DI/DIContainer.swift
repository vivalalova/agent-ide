import Foundation

/// 依賴注入容器
@MainActor
final class DIContainer: ObservableObject {
    /// 單例模式
    static let shared = DIContainer()

    /// 服務註冊表
    private var services: [String: Any] = [:]

    /// 工廠函式註冊表
    private var factories: [String: () -> Any] = [:]

    private init() {}

    /// 註冊服務實例
    func register<T>(_ type: T.Type, instance: T) {
        let key = String(describing: type)
        services[key] = instance
        Logger.shared.log("Registered service: \(key)", level: .debug)
    }

    /// 註冊工廠函式
    func register<T>(_ type: T.Type, factory: @escaping () -> T) {
        let key = String(describing: type)
        factories[key] = factory
        Logger.shared.log("Registered factory: \(key)", level: .debug)
    }

    /// 解析服務
    func resolve<T>(_ type: T.Type) -> T {
        let key = String(describing: type)

        // 先嘗試從已註冊的實例中取得
        if let service = services[key] as? T {
            return service
        }

        // 再嘗試使用工廠函式建立
        if let factory = factories[key] {
            let instance = factory() as! T
            services[key] = instance
            return instance
        }

        fatalError("Service not registered: \(key)")
    }

    /// 清除所有註冊
    func clear() {
        services.removeAll()
        factories.removeAll()
        Logger.shared.log("Cleared all registrations", level: .debug)
    }

    /// 檢查服務是否已註冊
    func isRegistered<T>(_ type: T.Type) -> Bool {
        let key = String(describing: type)
        return services[key] != nil || factories[key] != nil
    }
}
