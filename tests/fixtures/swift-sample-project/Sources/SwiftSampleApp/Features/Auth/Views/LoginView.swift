import SwiftUI

/// 登入視圖
struct LoginView: View {
    /// ViewModel
    @ObservedObject var viewModel: LoginViewModel

    /// 是否顯示密碼
    @State private var isPasswordVisible = false

    var body: some View {
        NavigationView {
            ZStack {
                backgroundGradient

                ScrollView {
                    VStack(spacing: 24) {
                        appLogoSection
                        loginFormSection
                        loginButtonSection
                        forgotPasswordSection
                    }
                    .padding(.horizontal, 32)
                    .padding(.top, 60)
                }
            }
            .navigationBarHidden(true)
            .loadingOverlay(isLoading: viewModel.isLoading)
            .errorAlert(error: Binding(
                get: { viewModel.errorMessage.flatMap { NSError(domain: "", code: 0, userInfo: [NSLocalizedDescriptionKey: $0]) as Error } },
                set: { _ in viewModel.clearError() }
            ), dismissAction: viewModel.clearError)
        }
    }

    /// 背景漸層
    private var backgroundGradient: some View {
        LinearGradient(
            gradient: Gradient(colors: [.blue.opacity(0.6), .purple.opacity(0.6)]),
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .edgesIgnoringSafeArea(.all)
    }

    /// App Logo 區塊
    private var appLogoSection: some View {
        VStack(spacing: 16) {
            Image(systemName: "lock.shield.fill")
                .resizable()
                .scaledToFit()
                .frame(width: 80, height: 80)
                .foregroundColor(.white)

            Text("SwiftSampleApp")
                .font(.largeTitle)
                .fontWeight(.bold)
                .foregroundColor(.white)

            Text("歡迎回來")
                .font(.subheadline)
                .foregroundColor(.white.opacity(0.8))
        }
    }

    /// 登入表單區塊
    private var loginFormSection: some View {
        VStack(spacing: 16) {
            emailField
            passwordField
            rememberMeToggle
        }
        .padding(.vertical, 24)
        .padding(.horizontal, 20)
        .background(Color.white.opacity(0.95))
        .cornerRadius(16)
    }

    /// 電子郵件欄位
    private var emailField: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("電子郵件")
                .font(.caption)
                .foregroundColor(.gray)

            HStack {
                Image(systemName: "envelope.fill")
                    .foregroundColor(.gray)
                TextField("請輸入電子郵件", text: $viewModel.email)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
            }
            .padding()
            .background(Color.gray.opacity(0.1))
            .cornerRadius(8)

            if let error = viewModel.emailError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }

    /// 密碼欄位
    private var passwordField: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("密碼")
                .font(.caption)
                .foregroundColor(.gray)

            HStack {
                Image(systemName: "lock.fill")
                    .foregroundColor(.gray)

                if isPasswordVisible {
                    TextField("請輸入密碼", text: $viewModel.password)
                } else {
                    SecureField("請輸入密碼", text: $viewModel.password)
                }

                Button(action: { isPasswordVisible.toggle() }) {
                    Image(systemName: isPasswordVisible ? "eye.slash.fill" : "eye.fill")
                        .foregroundColor(.gray)
                }
            }
            .padding()
            .background(Color.gray.opacity(0.1))
            .cornerRadius(8)

            if let error = viewModel.passwordError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }

    /// 記住我切換開關
    private var rememberMeToggle: some View {
        HStack {
            Toggle("記住我", isOn: $viewModel.rememberMe)
                .font(.caption)
            Spacer()
        }
    }

    /// 登入按鈕區塊
    private var loginButtonSection: some View {
        Button(action: {
            Task {
                await viewModel.login()
            }
        }) {
            Text("登入")
                .font(.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.blue)
                .cornerRadius(12)
        }
    }

    /// 忘記密碼區塊
    private var forgotPasswordSection: some View {
        VStack(spacing: 12) {
            Button(action: {}) {
                Text("忘記密碼？")
                    .font(.caption)
                    .foregroundColor(.white)
            }

            HStack {
                Text("還沒有帳號？")
                    .font(.caption)
                    .foregroundColor(.white)
                Button(action: {}) {
                    Text("立即註冊")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                }
            }
        }
    }
}

#Preview {
    LoginView(
        viewModel: LoginViewModel(
            authService: AuthService(
                networkService: NetworkService(),
                keychainManager: KeychainManager(),
                userDefaultsManager: UserDefaultsManager()
            )
        )
    )
}
