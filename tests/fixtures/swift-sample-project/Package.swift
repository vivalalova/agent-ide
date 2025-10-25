// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SwiftSampleApp",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "SwiftSampleApp",
            targets: ["SwiftSampleApp"]
        )
    ],
    dependencies: [],
    targets: [
        .target(
            name: "SwiftSampleApp",
            dependencies: []
        ),
        .testTarget(
            name: "SwiftSampleAppTests",
            dependencies: ["SwiftSampleApp"]
        )
    ]
)
