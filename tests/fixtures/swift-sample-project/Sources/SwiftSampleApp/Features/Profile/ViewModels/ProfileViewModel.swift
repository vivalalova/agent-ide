import Foundation
import Combine

/// 個人檔案 ViewModel
@MainActor
final class ProfileViewModel: BaseViewModel {
    /// 使用者個人檔案
    @Published var profile: UserProfile?

    /// 編輯中的個人檔案
    @Published var editingProfile: UserProfile?

    /// 是否處於編輯模式
    @Published var isEditMode: Bool = false

    /// 初始化
    override init() {
        super.init()
        Task {
            await loadProfile()
        }
    }

    /// 載入個人檔案
    func loadProfile() async {
        isLoading = true
        errorMessage = nil

        do {
            await Task.sleep(1_000_000_000)

            profile = UserProfile(
                userId: "user123",
                fullName: "測試使用者",
                nickname: "Test",
                birthDate: Date().adding(days: -365 * 25),
                gender: .male,
                phone: "0912345678",
                addresses: [],
                preferences: .default
            )

            Logger.shared.log("Profile loaded", level: .info)
        } catch {
            errorMessage = error.localizedDescription
            Logger.shared.error(error)
        }

        isLoading = false
    }

    /// 開始編輯
    func startEditing() {
        editingProfile = profile
        isEditMode = true
    }

    /// 取消編輯
    func cancelEditing() {
        editingProfile = nil
        isEditMode = false
    }

    /// 儲存個人檔案
    func saveProfile() async {
        guard let editingProfile = editingProfile else { return }

        isLoading = true
        errorMessage = nil

        do {
            await Task.sleep(1_000_000_000)

            profile = editingProfile
            self.editingProfile = nil
            isEditMode = false

            Logger.shared.log("Profile saved", level: .info)
        } catch {
            errorMessage = error.localizedDescription
            Logger.shared.error(error)
        }

        isLoading = false
    }

    /// 新增地址
    func addAddress(_ address: Address) {
        profile?.addresses.append(address)
        Logger.shared.log("Address added", level: .info)
    }

    /// 移除地址
    func removeAddress(_ address: Address) {
        profile?.addresses.removeAll { $0.id == address.id }
        Logger.shared.log("Address removed", level: .info)
    }

    /// 設定預設地址
    func setDefaultAddress(_ address: Address) {
        guard let index = profile?.addresses.firstIndex(where: { $0.id == address.id }) else { return }

        for i in profile?.addresses.indices ?? 0..<0 {
            profile?.addresses[i].isDefault = false
        }

        profile?.addresses[index].isDefault = true
        Logger.shared.log("Default address updated", level: .info)
    }

    /// 更新偏好設定
    func updatePreferences(_ preferences: UserPreferences) {
        profile?.preferences = preferences
        Logger.shared.log("Preferences updated", level: .info)
    }
}
