import Foundation
import Combine

@MainActor
class UserViewModel: ObservableObject {
    @Published var users: [UserProfile] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var selectedUser: UserProfile?
    @Published var username = ""
    @Published var email = ""

    private let userService: UserService
    private var cancellables = Set<AnyCancellable>()

    init(userService: UserService) {
        self.userService = userService
    }

    func loadUsers() async {
        isLoading = true
        errorMessage = nil

        do {
            users = try await userService.fetchUsers()
            isLoading = false
        } catch {
            // 行 30-35：錯誤處理邏輯（測試提取點）
            isLoading = false
            errorMessage = error.localizedDescription
            print("Failed to load users: \(error)")
            notifyError(error)
        }
    }

    // 行 36-42：創建使用者處理器（測試 extract-closure）
    func createUser() {
        guard !username.isEmpty, !email.isEmpty else {
            errorMessage = "Username and email are required"
            return
        }
        let newUser = UserProfile(name: username, email: email)
        users.append(newUser)
    }

    // 行 45-52：表單驗證邏輯（測試提取點）
    func validateForm() -> Bool {
        guard !username.isEmpty else {
            errorMessage = "Username is required"
            return false
        }
        guard email.contains("@") else {
            errorMessage = "Invalid email"
            return false
        }
        return true
    }

    private func notifyError(_ error: Error) {
        // Error notification logic
    }
}

struct UserProfile: Identifiable, Codable {
    let id: UUID
    let name: String
    let email: String

    init(id: UUID = UUID(), name: String, email: String) {
        self.id = id
        self.name = name
        self.email = email
    }
}
