import Foundation
import Combine

/// 登入 ViewModel
@MainActor
final class LoginViewModel: BaseViewModel {
    /// 電子郵件
    @Published var email: String = ""

    /// 密碼
    @Published var password: String = ""

    /// 是否記住我
    @Published var rememberMe: Bool = false

    /// 是否已認證
    @Published var isAuthenticated: Bool = false

    /// 電子郵件驗證錯誤
    @Published var emailError: String?

    /// 密碼驗證錯誤
    @Published var passwordError: String?

    /// 認證服務
    private let authService: AuthServiceProtocol

    /// Cancellables
    private var cancellables = Set<AnyCancellable>()

    /// 初始化
    init(authService: AuthServiceProtocol) {
        self.authService = authService
        super.init()
        setupValidation()
        checkAuthenticationStatus()
    }

    /// 登入
    func login() async {
        guard validateInputs() else { return }

        isLoading = true
        errorMessage = nil

        do {
            let user = try await authService.login(email: email, password: password)
            isAuthenticated = true
            Logger.shared.log("Login successful for user: \(user.username)", level: .info)
        } catch {
            errorMessage = error.localizedDescription
            Logger.shared.error(error)
        }

        isLoading = false
    }

    /// 登出
    func logout() async {
        isLoading = true

        do {
            try await authService.logout()
            isAuthenticated = false
            email = ""
            password = ""
        } catch {
            errorMessage = error.localizedDescription
            Logger.shared.error(error)
        }

        isLoading = false
    }

    /// 驗證輸入
    private func validateInputs() -> Bool {
        emailError = nil
        passwordError = nil

        let emailValidation = Validator.shared.validateEmail(email)
        if !emailValidation.isValid {
            emailError = emailValidation.errorMessage
            return false
        }

        let passwordValidation = Validator.shared.validatePassword(password)
        if !passwordValidation.isValid {
            passwordError = passwordValidation.errorMessage
            return false
        }

        return true
    }

    /// 設定即時驗證
    private func setupValidation() {
        $email
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] email in
                guard let self = self, !email.isEmpty else { return }
                let validation = Validator.shared.validateEmail(email)
                self.emailError = validation.isValid ? nil : validation.errorMessage
            }
            .store(in: &cancellables)

        $password
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] password in
                guard let self = self, !password.isEmpty else { return }
                let validation = Validator.shared.validatePassword(password)
                self.passwordError = validation.isValid ? nil : validation.errorMessage
            }
            .store(in: &cancellables)
    }

    /// 檢查認證狀態
    private func checkAuthenticationStatus() {
        Task {
            do {
                isAuthenticated = try await authService.validateToken()
            } catch {
                isAuthenticated = false
            }
        }
    }
}

/// Base ViewModel
@MainActor
class BaseViewModel: ObservableObject {
    /// 是否載入中
    @Published var isLoading: Bool = false

    /// 錯誤訊息
    @Published var errorMessage: String?

    /// 清除錯誤
    func clearError() {
        errorMessage = nil
    }
}
