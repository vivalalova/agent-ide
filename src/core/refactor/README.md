# Refactor 模組

## 主要功能

程式碼重構自動化工具，支援常見重構模式：

- **函式提取（Extract Function）**：將程式碼片段提取為獨立函式
- **函式內聯（Inline Function）**：將小函式內容展開到調用處
- **設計模式應用**：自動套用設計模式重構（Strategy、Factory、Decorator 等）
- **變數分析**：自動識別參數、返回值、區域變數

## 使用情境

- **程式碼簡化**：消除重複程式碼，提取可重用邏輯
- **複雜度降低**：將長函式拆分為多個小函式
- **可讀性提升**：為程式碼片段命名，提高語義清晰度
- **模式應用**：將現有程式碼重構為標準設計模式

## 核心類別

- `FunctionExtractor`：函式提取器
- `FunctionInliner`：函式內聯器
- `DesignPatternRefactorer`：設計模式重構器
- `ExtractionAnalyzer`：提取分析器
- `InlineAnalyzer`：內聯分析器
