/// 測試複雜引用情況
import Foundation

// MARK: - 非 DEADCODE: 被 processItems 使用

/// Transform a single item
func transformItem(_ item: String) -> String {
    return item.uppercased()
}

// MARK: - 非 DEADCODE: 被外部使用

/// Process a list of items
func processItems(_ items: [String]) -> [String] {
    return items.map { transformItem($0) }
}

// MARK: - DEADCODE: 定義了但沒有使用

/// Unused transformer function
func unusedTransformer(_ value: Int) -> Int {
    return value * 2
}

// MARK: - 非 DEADCODE: 被 createProcessor 使用

/// Processor class
class Processor {
    let name: String

    init(name: String) {
        self.name = name
    }

    func run() -> String {
        return "Running \(name)"
    }
}

// MARK: - 非 DEADCODE: 工廠函式

/// Create a processor instance
func createProcessor(name: String) -> Processor {
    return Processor(name: name)
}

// MARK: - DEADCODE: 未使用的工廠函式

/// Create an unused processor
func createUnusedProcessor() -> Processor {
    return Processor(name: "unused")
}

// 使用這些函式
let result = processItems(["a", "b", "c"])
let processor = createProcessor(name: "main")
