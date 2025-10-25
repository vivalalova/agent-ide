import Foundation

/// 格式化工具
final class Formatter {
    /// 單例模式
    static let shared = Formatter()

    private init() {}

    /// 格式化貨幣
    func formatCurrency(_ amount: Double, currency: String = "TWD") -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: amount)) ?? "\(amount)"
    }

    /// 格式化日期
    func formatDate(_ date: Date, format: String = "yyyy-MM-dd") -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = format
        formatter.timeZone = TimeZone(identifier: "Asia/Taipei")
        return formatter.string(from: date)
    }

    /// 格式化字串
    func formatString(_ string: String) -> String {
        return string.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
