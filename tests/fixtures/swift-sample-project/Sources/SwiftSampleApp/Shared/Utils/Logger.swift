import Foundation

/// 日誌記錄工具
final class Logger {
    /// 單例模式
    static let shared = Logger()

    /// 日誌等級
    private var currentLevel: LogLevel = .debug

    /// 是否啟用日誌
    private var isEnabled: Bool = true

    /// 日誌檔案路徑
    private var logFilePath: URL?

    private init() {
        setupLogFile()
    }

    /// 配置日誌系統
    func configure(level: LogLevel, enabled: Bool = true) {
        currentLevel = level
        isEnabled = enabled
    }

    /// 記錄日誌
    func log(_ message: String, level: LogLevel = .debug, file: String = #file, function: String = #function, line: Int = #line) {
        guard isEnabled, level.rawValue >= currentLevel.rawValue else { return }

        let timestamp = Date().fullDateTimeString
        let fileName = (file as NSString).lastPathComponent
        let logMessage = "[\(timestamp)] [\(level.emoji) \(level.name)] [\(fileName):\(line)] \(function) - \(message)"

        print(logMessage)
        writeToFile(logMessage)
    }

    /// 記錄錯誤
    func error(_ error: Error, file: String = #file, function: String = #function, line: Int = #line) {
        log("Error: \(error.localizedDescription)", level: .error, file: file, function: function, line: line)
    }

    /// 記錄網路請求
    func logNetworkRequest(url: String, method: String, headers: [String: String]? = nil) {
        var message = "[\(method)] \(url)"
        if let headers = headers {
            message += "\nHeaders: \(headers)"
        }
        log(message, level: .debug)
    }

    /// 記錄網路回應
    func logNetworkResponse(url: String, statusCode: Int, data: Data?) {
        var message = "[\(statusCode)] \(url)"
        if let data = data, let bodyString = String(data: data, encoding: .utf8) {
            message += "\nResponse: \(bodyString.prefix(500))"
        }
        log(message, level: .debug)
    }

    /// 設定日誌檔案
    private func setupLogFile() {
        guard let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return
        }
        logFilePath = documentsPath.appendingPathComponent("app.log")
    }

    /// 寫入檔案
    private func writeToFile(_ message: String) {
        guard let logFilePath = logFilePath else { return }

        let logEntry = message + "\n"
        guard let data = logEntry.data(using: .utf8) else { return }

        if FileManager.default.fileExists(atPath: logFilePath.path) {
            if let fileHandle = try? FileHandle(forWritingTo: logFilePath) {
                fileHandle.seekToEndOfFile()
                fileHandle.write(data)
                fileHandle.closeFile()
            }
        } else {
            try? data.write(to: logFilePath)
        }
    }

    /// 清除日誌檔案
    func clearLogFile() {
        guard let logFilePath = logFilePath else { return }
        try? FileManager.default.removeItem(at: logFilePath)
        setupLogFile()
    }
}

/// 日誌等級
enum LogLevel: Int {
    case debug = 0
    case info = 1
    case warning = 2
    case error = 3

    /// 等級名稱
    var name: String {
        switch self {
        case .debug: return "DEBUG"
        case .info: return "INFO"
        case .warning: return "WARN"
        case .error: return "ERROR"
        }
    }

    /// 等級表情符號
    var emoji: String {
        switch self {
        case .debug: return "🔍"
        case .info: return "ℹ️"
        case .warning: return "⚠️"
        case .error: return "❌"
        }
    }
}
