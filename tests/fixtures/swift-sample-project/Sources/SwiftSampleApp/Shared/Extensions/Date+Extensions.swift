import Foundation

/// Date 擴展功能
extension Date {
    /// 格式化為短日期字串（yyyy-MM-dd）
    var shortDateString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: self)
    }

    /// 格式化為長日期時間字串（yyyy-MM-dd HH:mm:ss）
    var fullDateTimeString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter.string(from: self)
    }

    /// 格式化為相對時間字串（例如：2 小時前）
    var relativeTimeString: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: self, relativeTo: Date())
    }

    /// 格式化為 ISO8601 字串
    var iso8601String: String {
        ISO8601DateFormatter().string(from: self)
    }

    /// 加上指定天數
    func adding(days: Int) -> Date {
        Calendar.current.date(byAdding: .day, value: days, to: self) ?? self
    }

    /// 加上指定小時
    func adding(hours: Int) -> Date {
        Calendar.current.date(byAdding: .hour, value: hours, to: self) ?? self
    }

    /// 加上指定分鐘
    func adding(minutes: Int) -> Date {
        Calendar.current.date(byAdding: .minute, value: minutes, to: self) ?? self
    }

    /// 是否為今天
    var isToday: Bool {
        Calendar.current.isDateInToday(self)
    }

    /// 是否為昨天
    var isYesterday: Bool {
        Calendar.current.isDateInYesterday(self)
    }

    /// 是否為明天
    var isTomorrow: Bool {
        Calendar.current.isDateInTomorrow(self)
    }

    /// 是否為週末
    var isWeekend: Bool {
        Calendar.current.isDateInWeekend(self)
    }

    /// 取得星期幾（1-7，1 為週日）
    var weekday: Int {
        Calendar.current.component(.weekday, from: self)
    }

    /// 取得當月第幾天
    var dayOfMonth: Int {
        Calendar.current.component(.day, from: self)
    }

    /// 取得當年第幾週
    var weekOfYear: Int {
        Calendar.current.component(.weekOfYear, from: self)
    }

    /// 取得該月的開始日期
    var startOfMonth: Date {
        let components = Calendar.current.dateComponents([.year, .month], from: self)
        return Calendar.current.date(from: components) ?? self
    }

    /// 取得該月的結束日期
    var endOfMonth: Date {
        var components = DateComponents()
        components.month = 1
        components.second = -1
        return Calendar.current.date(byAdding: components, to: startOfMonth) ?? self
    }
}
