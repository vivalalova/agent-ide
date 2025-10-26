import Foundation
import SwiftSyntax
import SwiftParser

// MARK: - JSON 輸出結構
struct ASTOutput: Codable {
    let type: String
    let root: ASTNode
    let sourceFile: String
    let metadata: Metadata
}

struct ASTNode: Codable {
    let type: String
    let range: Range
    let properties: [String: String]?
    let children: [ASTNode]
    let source: String?
}

struct Range: Codable {
    let start: Position
    let end: Position
}

struct Position: Codable {
    let line: Int
    let column: Int
    let offset: Int
}

struct Metadata: Codable {
    let language: String
    let parsed: Bool
    let parserVersion: String
}

// MARK: - Swift AST → JSON 轉換器
class ASTConverter {
    private let sourceLocationConverter: SourceLocationConverter

    init(source: String, tree: SourceFileSyntax) {
        self.sourceLocationConverter = SourceLocationConverter(fileName: "input.swift", tree: tree)
    }

    func convert(_ syntax: some SyntaxProtocol) -> ASTNode {
        // 使用 syntaxNodeType 取得正確的節點類型名稱
        let nodeType = String(describing: syntax.syntaxNodeType)
            .replacingOccurrences(of: "Syntax", with: "")

        let start = syntax.position
        let end = syntax.endPosition

        let startLoc = sourceLocationConverter.location(for: start)
        let endLoc = sourceLocationConverter.location(for: end)

        let range = Range(
            start: Position(
                line: startLoc.line,
                column: startLoc.column,
                offset: start.utf8Offset
            ),
            end: Position(
                line: endLoc.line,
                column: endLoc.column,
                offset: end.utf8Offset
            )
        )

        var properties: [String: String] = [:]

        // 提取關鍵資訊
        if let functionDecl = syntax.as(FunctionDeclSyntax.self) {
            properties["name"] = functionDecl.name.text
            properties["modifiers"] = functionDecl.modifiers.map { $0.name.text }.joined(separator: " ")
        } else if let classDecl = syntax.as(ClassDeclSyntax.self) {
            properties["name"] = classDecl.name.text
            properties["modifiers"] = classDecl.modifiers.map { $0.name.text }.joined(separator: " ")
        } else if let structDecl = syntax.as(StructDeclSyntax.self) {
            properties["name"] = structDecl.name.text
            properties["modifiers"] = structDecl.modifiers.map { $0.name.text }.joined(separator: " ")
        } else if let protocolDecl = syntax.as(ProtocolDeclSyntax.self) {
            properties["name"] = protocolDecl.name.text
            properties["modifiers"] = protocolDecl.modifiers.map { $0.name.text }.joined(separator: " ")
        } else if let enumDecl = syntax.as(EnumDeclSyntax.self) {
            properties["name"] = enumDecl.name.text
            properties["modifiers"] = enumDecl.modifiers.map { $0.name.text }.joined(separator: " ")
        } else if let varDecl = syntax.as(VariableDeclSyntax.self) {
            if let binding = varDecl.bindings.first,
               let pattern = binding.pattern.as(IdentifierPatternSyntax.self) {
                properties["name"] = pattern.identifier.text
                properties["modifiers"] = varDecl.modifiers.map { $0.name.text }.joined(separator: " ")
            }
        } else if let importDecl = syntax.as(ImportDeclSyntax.self) {
            properties["path"] = importDecl.path.map { $0.name.text }.joined(separator: ".")
        }

        // 遞迴處理子節點（過濾 Token）
        var children: [ASTNode] = []
        for child in syntax.children(viewMode: .sourceAccurate) {
            // 只過濾掉 Token 節點，其他都保留
            if !child.is(TokenSyntax.self) {
                children.append(convert(child))
            }
        }

        // 提取節點原始碼（trimmed，移除首尾空白）
        let sourceText = syntax.trimmedDescription

        return ASTNode(
            type: nodeType,
            range: range,
            properties: properties.isEmpty ? nil : properties,
            children: children,
            source: sourceText.isEmpty ? nil : sourceText
        )
    }

}

// MARK: - Main
func main() {
    // 讀取 stdin
    var input = ""
    while let line = readLine() {
        input += line + "\n"
    }

    guard !input.isEmpty else {
        let error = ["error": "No input provided"]
        if let jsonData = try? JSONEncoder().encode(error),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        }
        exit(1)
    }

    // 解析 Swift 程式碼
    let sourceFile = Parser.parse(source: input)

    // 轉換為 JSON AST
    let converter = ASTConverter(source: input, tree: sourceFile)
    let rootNode = converter.convert(sourceFile)

    let output = ASTOutput(
        type: "Program",
        root: rootNode,
        sourceFile: "input.swift",
        metadata: Metadata(
            language: "swift",
            parsed: true,
            parserVersion: "1.0.0"
        )
    )

    // 輸出 JSON
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

    do {
        let jsonData = try encoder.encode(output)
        if let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        }
    } catch {
        let errorOutput = ["error": "Failed to encode AST: \(error.localizedDescription)"]
        if let jsonData = try? JSONEncoder().encode(errorOutput),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        }
        exit(1)
    }
}

main()
