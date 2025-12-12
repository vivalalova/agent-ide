import Foundation

/// 通用倉儲協定
public protocol Repository {
    associatedtype Entity: Identifiable

    func findById(_ id: Entity.ID) async throws -> Entity?
    func findAll() async throws -> [Entity]
    func save(_ entity: Entity) async throws
    func delete(_ id: Entity.ID) async throws
}

/// 可搜尋協定
public protocol Searchable {
    associatedtype SearchCriteria

    func search(criteria: SearchCriteria) async throws -> [Self]
}

/// 可驗證協定
public protocol Validatable {
    func validate() -> Bool
    var validationErrors: [String] { get }
}

/// 快取協定
public protocol Cacheable {
    var cacheKey: String { get }
    var cacheDuration: TimeInterval { get }
}
