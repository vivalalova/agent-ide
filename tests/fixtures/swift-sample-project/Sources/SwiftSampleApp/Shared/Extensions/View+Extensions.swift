import SwiftUI

/// View 擴展功能
extension View {
    /// 載入中的覆蓋層
    func loadingOverlay(isLoading: Bool) -> some View {
        ZStack {
            self
            if isLoading {
                Color.black.opacity(0.3)
                    .edgesIgnoringSafeArea(.all)
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(1.5)
            }
        }
    }

    /// 錯誤提示
    func errorAlert(error: Binding<Error?>, dismissAction: @escaping () -> Void) -> some View {
        alert(
            "錯誤",
            isPresented: Binding(
                get: { error.wrappedValue != nil },
                set: { if !$0 { error.wrappedValue = nil } }
            ),
            actions: {
                Button("確定", action: dismissAction)
            },
            message: {
                if let error = error.wrappedValue {
                    Text(error.localizedDescription)
                }
            }
        )
    }

    /// 卡片樣式
    func cardStyle(cornerRadius: CGFloat = 12, shadowRadius: CGFloat = 5) -> some View {
        self
            .background(Color.white)
            .cornerRadius(cornerRadius)
            .shadow(color: Color.black.opacity(0.1), radius: shadowRadius, x: 0, y: 2)
    }

    /// 條件式套用修飾器
    @ViewBuilder
    func `if`<Transform: View>(_ condition: Bool, transform: (Self) -> Transform) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }

    /// 隱藏鍵盤
    func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    /// 導航列樣式
    func navigationBarStyle(backgroundColor: Color = .white, textColor: Color = .black) -> some View {
        self
            .toolbarBackground(backgroundColor, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.light, for: .navigationBar)
    }

    /// 邊框樣式
    func borderStyle(color: Color = .gray, width: CGFloat = 1, cornerRadius: CGFloat = 8) -> some View {
        self
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(color, lineWidth: width)
            )
    }

    /// 點擊手勢加上視覺回饋
    func onTapWithFeedback(perform action: @escaping () -> Void) -> some View {
        self
            .onTapGesture {
                let generator = UIImpactFeedbackGenerator(style: .light)
                generator.impactOccurred()
                action()
            }
    }
}
