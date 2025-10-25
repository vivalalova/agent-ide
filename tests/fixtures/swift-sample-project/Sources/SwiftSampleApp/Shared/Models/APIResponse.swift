import Foundation

/// API 回應的通用封裝
struct APIResponse<T: Codable>: Codable {
    /// 回應是否成功
    let success: Bool

    /// 回應資料
    let data: T?

    /// 錯誤訊息
    let message: String?

    /// HTTP 狀態碼
    let statusCode: Int

    /// 分頁資訊
    let pagination: Pagination?

    /// 回應時間戳
    let timestamp: Date

    /// 建立成功回應
    static func success(data: T, statusCode: Int = 200, pagination: Pagination? = nil) -> APIResponse<T> {
        APIResponse(
            success: true,
            data: data,
            message: nil,
            statusCode: statusCode,
            pagination: pagination,
            timestamp: Date()
        )
    }

    /// 建立失敗回應
    static func failure(message: String, statusCode: Int = 400) -> APIResponse<T> {
        APIResponse(
            success: false,
            data: nil,
            message: message,
            statusCode: statusCode,
            pagination: nil,
            timestamp: Date()
        )
    }
}

/// 分頁資訊
struct Pagination: Codable {
    /// 當前頁碼
    let currentPage: Int

    /// 每頁數量
    let perPage: Int

    /// 總頁數
    let totalPages: Int

    /// 總筆數
    let totalItems: Int

    /// 是否有下一頁
    var hasNextPage: Bool {
        currentPage < totalPages
    }

    /// 是否有上一頁
    var hasPreviousPage: Bool {
        currentPage > 1
    }

    /// CodingKeys for JSON mapping
    enum CodingKeys: String, CodingKey {
        case currentPage = "current_page"
        case perPage = "per_page"
        case totalPages = "total_pages"
        case totalItems = "total_items"
    }
}
