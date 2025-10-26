import SwiftUI

/// 產品詳情視圖
struct ProductDetailView: View {
    /// ViewModel
    @ObservedObject var viewModel: ProductDetailViewModel

    var body: some View {
        ScrollView {
            if let product = viewModel.product {
                VStack(alignment: .leading, spacing: 20) {
                    productImageSection(product: product)
                    productInfoSection(product: product)
                    quantitySection
                    addToCartButton
                }
                .padding()
            } else if viewModel.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("商品詳情")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                favoriteButton
            }
        }
    }

    /// 商品圖片區塊
    private func productImageSection(product: Product) -> some View {
        Rectangle()
            .fill(Color.gray.opacity(0.2))
            .aspectRatio(1, contentMode: .fit)
            .overlay(
                Image(systemName: "photo")
                    .font(.system(size: 80))
                    .foregroundColor(.gray)
            )
            .cornerRadius(12)
    }

    /// 商品資訊區塊
    private func productInfoSection(product: Product) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(product.name)
                .font(.title)
                .fontWeight(.bold)

            HStack {
                Text(product.formattedPrice)
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.blue)

                if product.hasDiscount, let originalPrice = product.formattedOriginalPrice {
                    Text(originalPrice)
                        .font(.body)
                        .strikethrough()
                        .foregroundColor(.gray)

                    Text("-\(product.discountPercentage)%")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.red)
                        .cornerRadius(4)
                }
            }

            HStack(spacing: 4) {
                ForEach(0..<5) { index in
                    Image(systemName: index < Int(product.rating) ? "star.fill" : "star")
                        .foregroundColor(.yellow)
                }
                Text(String(format: "%.1f", product.rating))
                    .foregroundColor(.gray)
                Text("(\(product.reviewCount) 則評論)")
                    .foregroundColor(.gray)
            }

            Divider()

            Text(product.description)
                .font(.body)
                .foregroundColor(.secondary)

            stockStatus(product: product)
        }
    }

    /// 庫存狀態
    private func stockStatus(product: Product) -> some View {
        HStack {
            Image(systemName: product.isInStock ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundColor(product.isInStock ? .green : .red)
            Text(product.isInStock ? "庫存：\(product.stockQuantity) 件" : "缺貨")
                .font(.subheadline)
                .foregroundColor(product.isInStock ? .green : .red)
        }
    }

    /// 數量選擇區塊
    private var quantitySection: some View {
        HStack {
            Text("數量")
                .font(.headline)

            Spacer()

            HStack(spacing: 16) {
                Button(action: { viewModel.decreaseQuantity() }) {
                    Image(systemName: "minus.circle.fill")
                        .font(.title2)
                        .foregroundColor(viewModel.quantity > 1 ? .blue : .gray)
                }
                .disabled(viewModel.quantity <= 1)

                Text("\(viewModel.quantity)")
                    .font(.headline)
                    .frame(minWidth: 30)

                Button(action: { viewModel.increaseQuantity() }) {
                    Image(systemName: "plus.circle.fill")
                        .font(.title2)
                        .foregroundColor(.blue)
                }
            }
        }
        .padding()
        .background(Color.gray.opacity(0.1))
        .cornerRadius(12)
    }

    /// 加入購物車按鈕
    private var addToCartButton: some View {
        Button(action: {
            Task {
                await viewModel.addToCart()
            }
        }) {
            HStack {
                Image(systemName: "cart.fill")
                VStack(alignment: .leading) {
                    Text("加入購物車")
                        .fontWeight(.bold)
                    Text("總計：\(viewModel.formattedTotalPrice)")
                        .font(.caption)
                }
            }
            .frame(maxWidth: .infinity)
            .padding()
            .background(viewModel.canAddToCart ? Color.blue : Color.gray)
            .foregroundColor(.white)
            .cornerRadius(12)
        }
        .disabled(!viewModel.canAddToCart)
    }

    /// 最愛按鈕
    private var favoriteButton: some View {
        Button(action: { viewModel.toggleFavorite() }) {
            Image(systemName: viewModel.isFavorite ? "heart.fill" : "heart")
                .foregroundColor(viewModel.isFavorite ? .red : .gray)
        }
    }
}

#Preview {
    NavigationView {
        ProductDetailView(
            viewModel: ProductDetailViewModel(
                productId: "1",
                productService: ProductService(
                    networkService: NetworkService()
                )
            )
        )
    }
}
