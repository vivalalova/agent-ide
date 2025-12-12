// swift-tools-version:5.5
import PackageDescription

let package = Package(
    name: "SwiftDeadcodeTest",
    products: [
        .library(name: "SwiftDeadcodeTest", targets: ["SwiftDeadcodeTest"])
    ],
    targets: [
        .target(name: "SwiftDeadcodeTest", path: "Sources")
    ]
)
