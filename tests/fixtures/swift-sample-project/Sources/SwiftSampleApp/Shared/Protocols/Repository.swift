import Foundation

/// 資料儲存庫協定
protocol Repository {
    associatedtype Entity

    func fetch(id: String) async throws -> Entity?
    func fetchAll() async throws -> [Entity]
    func save(_ entity: Entity) async throws
    func delete(id: String) async throws
}
