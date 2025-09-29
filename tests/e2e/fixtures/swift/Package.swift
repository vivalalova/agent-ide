// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SwiftTestProject",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
        .watchOS(.v10),
        .tvOS(.v17)
    ],
    products: [
        .library(
            name: "SwiftTestProject",
            targets: ["SwiftTestProject"]
        ),
        .executable(
            name: "SwiftTestProjectCLI",
            targets: ["SwiftTestProjectCLI"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-async-algorithms", from: "1.0.0"),
        .package(url: "https://github.com/apple/swift-collections", from: "1.0.0"),
        .package(url: "https://github.com/apple/swift-crypto", from: "3.0.0"),
    ],
    targets: [
        .target(
            name: "SwiftTestProject",
            dependencies: [
                .product(name: "AsyncAlgorithms", package: "swift-async-algorithms"),
                .product(name: "Collections", package: "swift-collections"),
                .product(name: "Crypto", package: "swift-crypto"),
            ]
        ),
        .executableTarget(
            name: "SwiftTestProjectCLI",
            dependencies: ["SwiftTestProject"]
        ),
        .testTarget(
            name: "SwiftTestProjectTests",
            dependencies: ["SwiftTestProject"]
        ),
    ]
)