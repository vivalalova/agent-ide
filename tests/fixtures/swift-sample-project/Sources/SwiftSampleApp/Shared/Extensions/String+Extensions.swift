import Foundation

/// String 擴展功能
extension String {
    /// 驗證是否為有效的電子郵件
    var isValidEmail: Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
        return emailPredicate.evaluate(with: self)
    }

    /// 驗證是否為有效的密碼（至少 8 字元，包含大小寫字母和數字）
    var isValidPassword: Bool {
        guard count >= 8 else { return false }
        let passwordRegex = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$"
        let passwordPredicate = NSPredicate(format: "SELF MATCHES %@", passwordRegex)
        return passwordPredicate.evaluate(with: self)
    }

    /// 移除前後空白字元
    var trimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// 轉換為 URL
    var toURL: URL? {
        URL(string: self)
    }

    /// 本地化字串
    var localized: String {
        NSLocalizedString(self, comment: "")
    }

    /// 安全地截取子字串
    func substring(from: Int, to: Int) -> String {
        let startIndex = index(self.startIndex, offsetBy: max(0, from))
        let endIndex = index(self.startIndex, offsetBy: min(count, to))
        return String(self[startIndex..<endIndex])
    }

    /// 計算字串的 MD5 雜湊
    var md5Hash: String {
        let data = Data(utf8)
        var digest = [UInt8](repeating: 0, count: 16)
        data.withUnsafeBytes { buffer in
            _ = digest.withUnsafeMutableBytes { digestBuffer in
                buffer.copyBytes(to: digestBuffer)
            }
        }
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    /// 轉換為駝峰命名
    var camelCased: String {
        let components = self.split(separator: "_")
        guard !components.isEmpty else { return self }
        let first = String(components[0]).lowercased()
        let rest = components.dropFirst().map { String($0).capitalized }
        return ([first] + rest).joined()
    }

    /// 轉換為蛇形命名
    var snakeCased: String {
        let pattern = "([a-z0-9])([A-Z])"
        let regex = try? NSRegularExpression(pattern: pattern)
        let range = NSRange(location: 0, length: count)
        let result = regex?.stringByReplacingMatches(
            in: self,
            range: range,
            withTemplate: "$1_$2"
        )
        return (result ?? self).lowercased()
    }
}
