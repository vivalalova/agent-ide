import Foundation

/// Log level
enum LogLevel: String {
    case debug = "DEBUG"
    case info = "INFO"
    case warning = "WARNING"
    case error = "ERROR"
}

/// Logger utility
final class Logger {
    /// Shared instance
    static let shared = Logger()

    /// Minimum log level
    var minLevel: LogLevel = .debug

    private init() {}

    /// Log message
    func log(_ message: String, level: LogLevel = .info, file: String = #file, line: Int = #line) {
        let fileName = URL(fileURLWithPath: file).lastPathComponent
        let timestamp = ISO8601DateFormatter().string(from: Date())
        print("[\(timestamp)] [\(level.rawValue)] [\(fileName):\(line)] \(message)")
    }

    /// Log debug message
    func debug(_ message: String, file: String = #file, line: Int = #line) {
        log(message, level: .debug, file: file, line: line)
    }

    /// Log info message
    func info(_ message: String, file: String = #file, line: Int = #line) {
        log(message, level: .info, file: file, line: line)
    }

    /// Log warning message
    func warning(_ message: String, file: String = #file, line: Int = #line) {
        log(message, level: .warning, file: file, line: line)
    }

    /// Log error
    func error(_ error: Error, file: String = #file, line: Int = #line) {
        log(error.localizedDescription, level: .error, file: file, line: line)
    }
}
