"""
Main application entry point
"""

from decimal import Decimal
from src.models import User, UserRole, Product, Category, Order
from src.services import AuthService, EmailService


def main():
    """Main function"""
    # Create users
    admin = User(id=1, username="admin", email="admin@example.com", role=UserRole.ADMIN)
    customer = User(id=2, username="customer", email="customer@example.com")

    # Create products
    laptop = Product(
        id=1,
        name="Gaming Laptop",
        price=Decimal("1299.99"),
        category=Category.ELECTRONICS,
        stock=10
    )
    book = Product(
        id=2,
        name="Python Programming",
        price=Decimal("49.99"),
        category=Category.BOOKS,
        stock=50
    )

    # Create order
    order = Order(id=1, user=customer)
    order.add_item(laptop, 1)
    order.add_item(book, 2)

    print(f"Order total: {order.total}")
    print(f"Item count: {order.item_count}")

    # Services
    email_service = EmailService("smtp.example.com")
    email_service.send_welcome_email(customer.email, customer.username)

    return 0


if __name__ == "__main__":
    exit(main())
