import Foundation

/// String 擴展
public extension String {
    /// 是否為有效的 Email
    var isValidEmail: Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        let predicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
        return predicate.evaluate(with: self)
    }

    /// 截斷字串
    func truncated(to length: Int, trailing: String = "...") -> String {
        if self.count > length {
            return String(self.prefix(length)) + trailing
        }
        return self
    }

    /// 轉換為 URL
    var asURL: URL? {
        return URL(string: self)
    }
}

/// Array 擴展
public extension Array where Element: Identifiable {
    /// 根據 ID 查找元素
    func find(id: Element.ID) -> Element? {
        return self.first { $0.id == id }
    }
}
