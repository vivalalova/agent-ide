"""
Order model module
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional
from decimal import Decimal
from datetime import datetime

from .user import User
from .product import Product


class OrderStatus(Enum):
    """Order status enumeration"""
    PENDING = "pending"
    CONFIRMED = "confirmed"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


@dataclass
class OrderItem:
    """Order item data class"""
    product: Product
    quantity: int
    unit_price: Decimal

    @property
    def total(self) -> Decimal:
        """Calculate item total"""
        return self.unit_price * self.quantity


@dataclass
class Order:
    """Order data class"""
    id: int
    user: User
    items: List[OrderItem] = field(default_factory=list)
    status: OrderStatus = OrderStatus.PENDING
    created_at: datetime = field(default_factory=datetime.now)
    notes: Optional[str] = None

    @property
    def total(self) -> Decimal:
        """Calculate order total"""
        return sum(item.total for item in self.items)

    @property
    def item_count(self) -> int:
        """Get total item count"""
        return sum(item.quantity for item in self.items)

    def add_item(self, product: Product, quantity: int) -> None:
        """Add item to order"""
        if quantity <= 0:
            raise ValueError("Quantity must be positive")
        if not product.is_available():
            raise ValueError("Product is not available")

        # Check if product already in order
        for item in self.items:
            if item.product.id == product.id:
                item.quantity += quantity
                return

        self.items.append(OrderItem(
            product=product,
            quantity=quantity,
            unit_price=product.price
        ))

    def remove_item(self, product_id: int) -> bool:
        """Remove item from order"""
        for i, item in enumerate(self.items):
            if item.product.id == product_id:
                self.items.pop(i)
                return True
        return False

    def confirm(self) -> None:
        """Confirm the order"""
        if self.status != OrderStatus.PENDING:
            raise ValueError("Can only confirm pending orders")
        if not self.items:
            raise ValueError("Cannot confirm empty order")
        self.status = OrderStatus.CONFIRMED

    def cancel(self) -> None:
        """Cancel the order"""
        if self.status in (OrderStatus.SHIPPED, OrderStatus.DELIVERED):
            raise ValueError("Cannot cancel shipped or delivered orders")
        self.status = OrderStatus.CANCELLED

    def ship(self) -> None:
        """Ship the order"""
        if self.status != OrderStatus.CONFIRMED:
            raise ValueError("Can only ship confirmed orders")
        self.status = OrderStatus.SHIPPED

    def deliver(self) -> None:
        """Mark order as delivered"""
        if self.status != OrderStatus.SHIPPED:
            raise ValueError("Can only deliver shipped orders")
        self.status = OrderStatus.DELIVERED


class OrderProcessor:
    """Order processing service"""

    def __init__(self):
        self._orders: List[Order] = []

    def create_order(self, user: User) -> Order:
        """Create a new order"""
        order_id = len(self._orders) + 1
        order = Order(id=order_id, user=user)
        self._orders.append(order)
        return order

    def get_user_orders(self, user_id: int) -> List[Order]:
        """Get orders for a user"""
        return [o for o in self._orders if o.user.id == user_id]

    def get_orders_by_status(self, status: OrderStatus) -> List[Order]:
        """Get orders by status"""
        return [o for o in self._orders if o.status == status]

    # Complex method for complexity analysis
    def process_order(self, order: Order) -> bool:
        """Process an order with multiple conditions"""
        if order.status == OrderStatus.CANCELLED:
            return False

        if order.status == OrderStatus.PENDING:
            if order.items:
                for item in order.items:
                    if item.product.stock < item.quantity:
                        return False
                    if item.quantity <= 0:
                        return False

                order.confirm()
                return True
            else:
                return False
        elif order.status == OrderStatus.CONFIRMED:
            for item in order.items:
                item.product.stock -= item.quantity
            order.ship()
            return True
        elif order.status == OrderStatus.SHIPPED:
            order.deliver()
            return True

        return False
