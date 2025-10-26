import Foundation
import Security

/// Keychain 管理器
final class KeychainManager {
    /// 儲存值到 Keychain
    func save(_ value: String, forKey key: String) throws {
        guard let data = value.data(using: .utf8) else {
            throw KeychainError.encodingError
        }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlocked
        ]

        SecItemDelete(query as CFDictionary)

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.saveFailed(status: status)
        }

        Logger.shared.log("Saved to Keychain: \(key)", level: .debug)
    }

    /// 從 Keychain 讀取值
    func load(forKey key: String) throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess else {
            if status == errSecItemNotFound {
                return nil
            }
            throw KeychainError.loadFailed(status: status)
        }

        guard let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            throw KeychainError.decodingError
        }

        Logger.shared.log("Loaded from Keychain: \(key)", level: .debug)
        return value
    }

    /// 從 Keychain 移除值
    func remove(forKey key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]

        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.deleteFailed(status: status)
        }

        Logger.shared.log("Removed from Keychain: \(key)", level: .debug)
    }

    /// 清除所有 Keychain 資料
    func clear() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword
        ]

        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.deleteFailed(status: status)
        }

        Logger.shared.log("Cleared all Keychain data", level: .debug)
    }

    /// 檢查 key 是否存在
    func exists(forKey key: String) -> Bool {
        do {
            let value = try load(forKey: key)
            return value != nil
        } catch {
            return false
        }
    }
}

/// Keychain 錯誤
enum KeychainError: LocalizedError {
    case encodingError
    case decodingError
    case saveFailed(status: OSStatus)
    case loadFailed(status: OSStatus)
    case deleteFailed(status: OSStatus)

    /// 錯誤描述
    var errorDescription: String? {
        switch self {
        case .encodingError:
            return "資料編碼錯誤"
        case .decodingError:
            return "資料解碼錯誤"
        case .saveFailed(let status):
            return "儲存到 Keychain 失敗（狀態碼：\(status)）"
        case .loadFailed(let status):
            return "從 Keychain 讀取失敗（狀態碼：\(status)）"
        case .deleteFailed(let status):
            return "從 Keychain 刪除失敗（狀態碼：\(status)）"
        }
    }
}
