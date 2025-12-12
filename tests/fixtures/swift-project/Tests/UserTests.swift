import XCTest
@testable import SwiftProject

final class UserTests: XCTestCase {
    var userService: UserService!

    override func setUp() {
        super.setUp()
        userService = UserService()
    }

    override func tearDown() {
        userService = nil
        super.tearDown()
    }

    func testCreateUser() {
        let user = userService.createUser(name: "John", email: "john@example.com", age: 30)
        XCTAssertEqual(user.name, "John")
        XCTAssertEqual(user.email, "john@example.com")
        XCTAssertEqual(user.age, 30)
    }

    func testUserValidation() {
        let validUser = User(name: "John", email: "john@example.com", age: 30)
        XCTAssertTrue(validUser.validate())

        let invalidUser = User(name: "", email: "invalid", age: -1)
        XCTAssertFalse(invalidUser.validate())
    }

    func testDisplayName() {
        let user = User(name: "John Doe", email: "john@example.com", age: 30)
        XCTAssertEqual(user.displayName(), "John Doe <john@example.com>")
    }
}
