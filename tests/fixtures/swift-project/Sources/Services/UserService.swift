import Foundation

/// 使用者服務
public class UserService {
    private var users: [UUID: User] = [:]

    public init() {}

    /// 建立使用者
    public func createUser(name: String, email: String, age: Int) -> User {
        let user = User(name: name, email: email, age: age)
        users[user.id] = user
        return user
    }

    /// 取得使用者
    public func getUser(id: UUID) -> User? {
        return users[id]
    }

    /// 更新使用者
    public func updateUser(_ user: User) {
        users[user.id] = user
    }

    /// 刪除使用者
    public func deleteUser(id: UUID) {
        users.removeValue(forKey: id)
    }

    /// 取得所有使用者
    public func getAllUsers() -> [User] {
        return Array(users.values)
    }

    /// 搜尋使用者
    public func searchUsers(query: String) -> [User] {
        return users.values.filter { user in
            user.name.lowercased().contains(query.lowercased()) ||
            user.email.lowercased().contains(query.lowercased())
        }
    }
}

/// 非同步使用者服務
@MainActor
public class AsyncUserService {
    private let userService: UserService

    public init(userService: UserService = UserService()) {
        self.userService = userService
    }

    public func fetchUser(id: UUID) async -> User? {
        return userService.getUser(id: id)
    }
}
