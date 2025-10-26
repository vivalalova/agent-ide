import Foundation

/// 應用程式委託處理生命週期事件
@MainActor
final class AppDelegate: NSObject {
    /// 應用程式啟動完成
    func applicationDidFinishLaunching() {
        setupAppearance()
        setupLogging()
        registerDependencies()
    }

    /// 應用程式將進入前景
    func applicationWillEnterForeground() {
        Logger.shared.log("App will enter foreground", level: .info)
    }

    /// 應用程式進入背景
    func applicationDidEnterBackground() {
        Logger.shared.log("App did enter background", level: .info)
        cleanupTemporaryData()
    }

    /// 設定應用程式外觀
    private func setupAppearance() {
        Logger.shared.log("Setting up appearance", level: .debug)
    }

    /// 設定日誌系統
    private func setupLogging() {
        Logger.shared.configure(level: .debug)
        Logger.shared.log("Logging system initialized", level: .info)
    }

    /// 註冊依賴注入
    private func registerDependencies() {
        let container = DIContainer.shared
        ServiceFactory.registerServices(in: container)
        Logger.shared.log("Dependencies registered", level: .info)
    }

    /// 清理暫存資料
    private func cleanupTemporaryData() {
        Logger.shared.log("Cleaning up temporary data", level: .debug)
    }
}
