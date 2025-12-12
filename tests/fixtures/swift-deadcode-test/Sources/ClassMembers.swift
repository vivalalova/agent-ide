/// 測試類別成員的 dead code 檢測
import Foundation

/// User service with some unused members
class UserService {
    // DEADCODE: 未使用的類別屬性
    private static var unusedCache: [String: String] = [:]

    private var users: [String] = []

    // 非 DEADCODE: 使用中的方法
    func addUser(_ name: String) -> Bool {
        users.append(name)
        return validateName(name)
    }

    // 非 DEADCODE: 被 addUser 呼叫
    private func validateName(_ name: String) -> Bool {
        return !name.isEmpty
    }

    // DEADCODE: 未使用的私有方法
    private func unusedPrivateMethod() -> String {
        return "unused"
    }

    // DEADCODE: 未使用的靜態方法
    static func unusedStaticMethod() -> String {
        return "static unused"
    }

    // DEADCODE: 未使用的計算屬性
    var unusedComputedProperty: Int {
        return users.count * 2
    }
}

// 在模組層級使用 UserService
let service = UserService()
let _ = service.addUser("test")
