# Swift Sample Project

商業級 SwiftUI + MVVM 測試專案，用於測試 Swift Parser 和程式碼分析工具。

## 專案統計

- **總檔案數**: 42 個 Swift 檔案
- **架構**: MVVM + SwiftUI + Combine
- **最低支援版本**: iOS 16 / macOS 13
- **Swift 版本**: 5.9+

## 目錄結構

```
Sources/SwiftSampleApp/
├── App/                          # 應用程式入口點 (2)
│   ├── SwiftSampleApp.swift     # @main App
│   └── AppDelegate.swift         # App 生命週期
│
├── Features/                     # 功能模組 (18)
│   ├── Auth/                     # 認證功能 (4)
│   │   ├── Models/
│   │   │   └── AuthCredentials.swift
│   │   ├── Services/
│   │   │   └── AuthService.swift
│   │   ├── ViewModels/
│   │   │   └── LoginViewModel.swift
│   │   └── Views/
│   │       └── LoginView.swift
│   │
│   ├── Products/                 # 產品功能 (6)
│   │   ├── Models/
│   │   │   └── Product.swift
│   │   ├── Services/
│   │   │   └── ProductService.swift
│   │   ├── ViewModels/
│   │   │   ├── ProductListViewModel.swift
│   │   │   └── ProductDetailViewModel.swift
│   │   └── Views/
│   │       ├── ProductListView.swift
│   │       └── ProductDetailView.swift
│   │
│   ├── Orders/                   # 訂單功能 (4) 【高複雜度】
│   │   ├── Models/
│   │   │   └── Order.swift
│   │   ├── Services/
│   │   │   └── OrderService.swift
│   │   ├── ViewModels/
│   │   │   └── OrderViewModel.swift  # 複雜業務邏輯
│   │   └── Views/
│   │       └── OrderListView.swift
│   │
│   ├── Cart/                     # 購物車功能 (2)
│   │   ├── Models/
│   │   │   └── CartItem.swift
│   │   └── ViewModels/
│   │       └── CartViewModel.swift
│   │
│   └── Profile/                  # 個人檔案功能 (2)
│       ├── Models/
│       │   └── UserProfile.swift
│       └── ViewModels/
│           └── ProfileViewModel.swift
│
├── Core/                         # 核心基礎設施 (9)
│   ├── Networking/               # 網路層 (4)
│   │   ├── NetworkService.swift  # async/await
│   │   ├── NetworkError.swift
│   │   ├── APIEndpoint.swift
│   │   └── HTTPMethod.swift
│   ├── DI/                       # 依賴注入 (3)
│   │   ├── DIContainer.swift
│   │   ├── ServiceProtocols.swift
│   │   └── ServiceFactory.swift
│   └── Storage/                  # 儲存層 (2)
│       ├── UserDefaultsManager.swift
│       └── KeychainManager.swift
│
├── Shared/                       # 共用元件 (8)
│   ├── Models/                   # 共用資料模型 (2)
│   │   ├── User.swift
│   │   └── APIResponse.swift
│   ├── Extensions/               # 擴展功能 (3)
│   │   ├── String+Extensions.swift
│   │   ├── Date+Extensions.swift
│   │   └── View+Extensions.swift
│   ├── Utils/                    # 工具類 (2)
│   │   ├── Validator.swift
│   │   └── Logger.swift
│   └── Constants/                # 常數定義 (2)
│       ├── AppConstants.swift
│       └── APIConstants.swift
│
└── Resources/                    # 資源檔案 (1)
    └── Config.swift              # 環境配置

Tests/SwiftSampleAppTests/        # 測試 (2)
├── AuthTests/
│   └── AuthServiceTests.swift
└── NetworkingTests/
    └── NetworkServiceTests.swift
```

## 架構特點

### 1. MVVM 架構
- **Model**: 資料模型，包含業務邏輯
- **View**: SwiftUI 視圖，聲明式 UI
- **ViewModel**: 狀態管理，使用 `@Published` 和 Combine

### 2. 依賴注入
- Protocol-based DI
- DIContainer 集中管理
- ServiceFactory 工廠模式

### 3. 網路層
- URLSession + async/await
- Protocol-oriented 設計
- 統一錯誤處理

### 4. 響應式編程
- Combine Framework
- @Published 屬性
- Publishers.CombineLatest

### 5. 儲存層
- UserDefaults 輕量級儲存
- Keychain 安全儲存

## 複雜度分析

### 高複雜度檔案
1. **OrderViewModel.swift** (150+ 行)
   - 複雜的訂單計算邏輯
   - 多重篩選和排序
   - 折扣和運費計算
   - 統計資訊計算

### 中複雜度檔案
1. **NetworkService.swift** (100+ 行)
   - async/await 實作
   - 錯誤處理
   - 重試機制

2. **AuthService.swift** (100+ 行)
   - 多個認證方法
   - Token 管理
   - 快取處理

### 低複雜度檔案
- Models: 純資料結構
- Extensions: 簡單擴展功能
- Constants: 常數定義

## 程式碼品質特徵

### ✅ 優良實踐
- Protocol-oriented 設計
- 依賴注入
- 錯誤處理完整
- 使用 async/await
- Combine 響應式編程
- 完整的 JSDoc 註解

### 🎯 測試覆蓋
- 認證服務測試
- 網路服務測試
- Mock 物件實作

## 使用範例

### 編譯專案
```bash
swift build
```

### 執行測試
```bash
swift test
```

## 測試用途

此專案專為測試以下功能設計：
- Swift Parser 解析能力
- AST 提取和分析
- 符號引用查找
- 依賴關係分析
- 複雜度計算
- 程式碼品質檢測
