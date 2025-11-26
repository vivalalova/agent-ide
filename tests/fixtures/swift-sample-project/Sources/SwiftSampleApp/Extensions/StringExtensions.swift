import Foundation

extension String {
    /// Check if string is a valid email
    var isValidEmail: Bool {
        Validator.shared.validateEmail(self).isValid
    }

    /// Trim whitespace and newlines
    var trimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Convert to camelCase
    var camelCased: String {
        let words = components(separatedBy: CharacterSet.alphanumerics.inverted)
        let first = words.first?.lowercased() ?? ""
        let rest = words.dropFirst().map { $0.capitalized }
        return ([first] + rest).joined()
    }

    /// Convert to snake_case
    var snakeCased: String {
        let pattern = "([a-z0-9])([A-Z])"
        let regex = try? NSRegularExpression(pattern: pattern, options: [])
        let range = NSRange(startIndex..., in: self)
        let result = regex?.stringByReplacingMatches(
            in: self,
            options: [],
            range: range,
            withTemplate: "$1_$2"
        )
        return (result ?? self).lowercased()
    }

    /// Truncate string to length
    func truncated(to length: Int, trailing: String = "...") -> String {
        if count <= length {
            return self
        }
        return String(prefix(length)) + trailing
    }
}
