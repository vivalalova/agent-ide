import Foundation

/// UserDefaults 管理器
final class UserDefaultsManager {
    /// UserDefaults 實例
    private let userDefaults: UserDefaults

    /// 初始化
    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
    }

    /// 儲存值
    func save<T: Codable>(_ value: T, forKey key: String) throws {
        let encoder = JSONEncoder()
        let data = try encoder.encode(value)
        userDefaults.set(data, forKey: key)
        Logger.shared.log("Saved to UserDefaults: \(key)", level: .debug)
    }

    /// 讀取值
    func load<T: Codable>(forKey key: String) throws -> T? {
        guard let data = userDefaults.data(forKey: key) else {
            return nil
        }
        let decoder = JSONDecoder()
        let value = try decoder.decode(T.self, from: data)
        Logger.shared.log("Loaded from UserDefaults: \(key)", level: .debug)
        return value
    }

    /// 儲存字串
    func saveString(_ value: String, forKey key: String) {
        userDefaults.set(value, forKey: key)
    }

    /// 讀取字串
    func loadString(forKey key: String) -> String? {
        userDefaults.string(forKey: key)
    }

    /// 儲存整數
    func saveInt(_ value: Int, forKey key: String) {
        userDefaults.set(value, forKey: key)
    }

    /// 讀取整數
    func loadInt(forKey key: String) -> Int {
        userDefaults.integer(forKey: key)
    }

    /// 儲存布林值
    func saveBool(_ value: Bool, forKey key: String) {
        userDefaults.set(value, forKey: key)
    }

    /// 讀取布林值
    func loadBool(forKey key: String) -> Bool {
        userDefaults.bool(forKey: key)
    }

    /// 儲存 Date
    func saveDate(_ value: Date, forKey key: String) {
        userDefaults.set(value, forKey: key)
    }

    /// 讀取 Date
    func loadDate(forKey key: String) -> Date? {
        userDefaults.object(forKey: key) as? Date
    }

    /// 移除值
    func remove(forKey key: String) {
        userDefaults.removeObject(forKey: key)
        Logger.shared.log("Removed from UserDefaults: \(key)", level: .debug)
    }

    /// 清除所有資料
    func clear() {
        let dictionary = userDefaults.dictionaryRepresentation()
        dictionary.keys.forEach { key in
            userDefaults.removeObject(forKey: key)
        }
        Logger.shared.log("Cleared all UserDefaults", level: .debug)
    }

    /// 檢查 key 是否存在
    func exists(forKey key: String) -> Bool {
        userDefaults.object(forKey: key) != nil
    }
}
