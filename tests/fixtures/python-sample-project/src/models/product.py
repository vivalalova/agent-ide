"""
Product model module
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List
from decimal import Decimal


class Category(Enum):
    """Product category enumeration"""
    ELECTRONICS = "electronics"
    CLOTHING = "clothing"
    FOOD = "food"
    BOOKS = "books"
    OTHER = "other"


@dataclass
class Product:
    """Product data class"""
    id: int
    name: str
    price: Decimal
    category: Category
    description: Optional[str] = None
    stock: int = 0
    tags: List[str] = field(default_factory=list)

    def is_available(self) -> bool:
        """Check if product is in stock"""
        return self.stock > 0

    def apply_discount(self, percentage: float) -> Decimal:
        """Apply discount and return new price"""
        if percentage < 0 or percentage > 100:
            raise ValueError("Discount must be between 0 and 100")
        discount = self.price * Decimal(percentage / 100)
        return self.price - discount

    def add_tag(self, tag: str) -> None:
        """Add a tag to product"""
        if tag not in self.tags:
            self.tags.append(tag)

    def remove_tag(self, tag: str) -> bool:
        """Remove a tag from product"""
        if tag in self.tags:
            self.tags.remove(tag)
            return True
        return False


class ProductCatalog:
    """Product catalog management"""

    def __init__(self):
        self._products: List[Product] = []

    def add_product(self, product: Product) -> None:
        """Add product to catalog"""
        self._products.append(product)

    def find_by_category(self, category: Category) -> List[Product]:
        """Find products by category"""
        return [p for p in self._products if p.category == category]

    def find_by_price_range(self, min_price: Decimal, max_price: Decimal) -> List[Product]:
        """Find products within price range"""
        return [
            p for p in self._products
            if min_price <= p.price <= max_price
        ]

    def search_by_name(self, query: str) -> List[Product]:
        """Search products by name"""
        query_lower = query.lower()
        return [p for p in self._products if query_lower in p.name.lower()]

    def get_available_products(self) -> List[Product]:
        """Get all available products"""
        return [p for p in self._products if p.is_available()]


# Constants
MIN_PRICE = Decimal("0.01")
MAX_PRICE = Decimal("999999.99")
