// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "SwiftProject",
    platforms: [
        .macOS(.v13),
        .iOS(.v16)
    ],
    products: [
        .library(name: "SwiftProject", targets: ["SwiftProject"])
    ],
    dependencies: [],
    targets: [
        .target(name: "SwiftProject", dependencies: [], path: "Sources"),
        .testTarget(name: "SwiftProjectTests", dependencies: ["SwiftProject"], path: "Tests")
    ]
)
