"""
Helper utilities module
"""

import re
from decimal import Decimal
from datetime import datetime
from typing import Optional


def format_currency(amount: Decimal, currency: str = "USD") -> str:
    """Format amount as currency string"""
    symbols = {
        "USD": "$",
        "EUR": "\u20ac",
        "GBP": "\u00a3",
        "JPY": "\u00a5",
        "TWD": "NT$"
    }
    symbol = symbols.get(currency, currency)
    return f"{symbol}{amount:,.2f}"


def format_date(dt: datetime, fmt: str = "%Y-%m-%d") -> str:
    """Format datetime as string"""
    return dt.strftime(fmt)


def parse_date(date_str: str, fmt: str = "%Y-%m-%d") -> Optional[datetime]:
    """Parse string to datetime"""
    try:
        return datetime.strptime(date_str, fmt)
    except ValueError:
        return None


def slugify(text: str) -> str:
    """Convert text to URL-friendly slug"""
    # Convert to lowercase
    slug = text.lower()
    # Replace spaces with hyphens
    slug = slug.replace(" ", "-")
    # Remove non-alphanumeric characters (except hyphens)
    slug = re.sub(r"[^a-z0-9-]", "", slug)
    # Remove consecutive hyphens
    slug = re.sub(r"-+", "-", slug)
    # Remove leading/trailing hyphens
    slug = slug.strip("-")
    return slug


def truncate(text: str, max_length: int, suffix: str = "...") -> str:
    """Truncate text to max length"""
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix


def camel_to_snake(name: str) -> str:
    """Convert camelCase to snake_case"""
    pattern = re.compile(r"(?<!^)(?=[A-Z])")
    return pattern.sub("_", name).lower()


def snake_to_camel(name: str) -> str:
    """Convert snake_case to camelCase"""
    components = name.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


# Unused function for dead code detection
def deprecated_helper():
    """This function is deprecated and unused"""
    pass


# Constants
DEFAULT_DATE_FORMAT = "%Y-%m-%d"
DEFAULT_DATETIME_FORMAT = "%Y-%m-%d %H:%M:%S"
