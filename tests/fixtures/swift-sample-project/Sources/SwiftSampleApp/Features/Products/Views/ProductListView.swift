import SwiftUI

/// 產品列表視圖
struct ProductListView: View {
    /// ViewModel
    @ObservedObject var viewModel: ProductListViewModel

    /// 網格布局
    private let columns = [
        GridItem(.flexible()),
        GridItem(.flexible())
    ]

    var body: some View {
        NavigationView {
            ZStack {
                ScrollView {
                    VStack(spacing: 20) {
                        searchBar
                        categoryFilter
                        featuredSection
                        productGridSection
                    }
                    .padding(.horizontal)
                }

                if viewModel.isLoading && viewModel.products.isEmpty {
                    ProgressView()
                }
            }
            .navigationTitle("商品")
            .navigationBarTitleDisplayMode(.large)
        }
    }

    /// 搜尋列
    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.gray)
            TextField("搜尋商品", text: $viewModel.searchQuery)
                .textFieldStyle(PlainTextFieldStyle())
        }
        .padding()
        .background(Color.gray.opacity(0.1))
        .cornerRadius(10)
    }

    /// 類別篩選
    private var categoryFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(ProductCategory.allCases, id: \.self) { category in
                    CategoryChip(
                        category: category,
                        isSelected: viewModel.selectedCategory == category,
                        action: {
                            Task {
                                await viewModel.filterByCategory(
                                    viewModel.selectedCategory == category ? nil : category
                                )
                            }
                        }
                    )
                }
            }
        }
    }

    /// 精選商品區塊
    @ViewBuilder
    private var featuredSection: some View {
        if !viewModel.featuredProducts.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text("精選商品")
                    .font(.headline)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 16) {
                        ForEach(viewModel.featuredProducts) { product in
                            FeaturedProductCard(product: product)
                        }
                    }
                }
            }
        }
    }

    /// 商品網格區塊
    private var productGridSection: some View {
        LazyVGrid(columns: columns, spacing: 16) {
            ForEach(viewModel.products) { product in
                ProductCard(product: product)
            }
        }
    }
}

/// 類別標籤
struct CategoryChip: View {
    let category: ProductCategory
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: category.icon)
                Text(category.displayName)
                    .font(.caption)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(isSelected ? Color.blue : Color.gray.opacity(0.1))
            .foregroundColor(isSelected ? .white : .primary)
            .cornerRadius(20)
        }
    }
}

/// 商品卡片
struct ProductCard: View {
    let product: Product

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            productImage

            VStack(alignment: .leading, spacing: 4) {
                Text(product.name)
                    .font(.subheadline)
                    .lineLimit(2)

                HStack {
                    Text(product.formattedPrice)
                        .font(.headline)
                        .foregroundColor(.blue)

                    if product.hasDiscount, let originalPrice = product.formattedOriginalPrice {
                        Text(originalPrice)
                            .font(.caption)
                            .strikethrough()
                            .foregroundColor(.gray)
                    }
                }

                ratingView
            }
            .padding(8)
        }
        .background(Color.white)
        .cardStyle()
    }

    /// 商品圖片
    private var productImage: some View {
        Rectangle()
            .fill(Color.gray.opacity(0.2))
            .aspectRatio(1, contentMode: .fit)
            .overlay(
                Image(systemName: "photo")
                    .font(.largeTitle)
                    .foregroundColor(.gray)
            )
    }

    /// 評分視圖
    private var ratingView: some View {
        HStack(spacing: 4) {
            Image(systemName: "star.fill")
                .font(.caption)
                .foregroundColor(.yellow)
            Text(String(format: "%.1f", product.rating))
                .font(.caption)
                .foregroundColor(.gray)
            Text("(\(product.reviewCount))")
                .font(.caption)
                .foregroundColor(.gray)
        }
    }
}

/// 精選商品卡片
struct FeaturedProductCard: View {
    let product: Product

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Rectangle()
                .fill(Color.blue.opacity(0.2))
                .frame(width: 200, height: 120)
                .cornerRadius(8)

            Text(product.name)
                .font(.subheadline)
                .fontWeight(.medium)
                .lineLimit(1)

            Text(product.formattedPrice)
                .font(.headline)
                .foregroundColor(.blue)
        }
        .frame(width: 200)
        .cardStyle()
    }
}

#Preview {
    ProductListView(
        viewModel: ProductListViewModel(
            productService: ProductService(
                networkService: NetworkService()
            )
        )
    )
}
