"""
Validation utilities module
"""

import re
from typing import Tuple


def validate_email(email: str) -> Tuple[bool, str]:
    """
    Validate email format
    Returns tuple of (is_valid, error_message)
    """
    if not email:
        return False, "Email is required"

    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    if not re.match(pattern, email):
        return False, "Invalid email format"

    return True, ""


def validate_phone(phone: str) -> Tuple[bool, str]:
    """
    Validate phone number format
    Returns tuple of (is_valid, error_message)
    """
    if not phone:
        return False, "Phone number is required"

    # Remove common separators
    cleaned = re.sub(r"[\s\-\(\)]", "", phone)

    # Check if only digits remain (with optional leading +)
    if not re.match(r"^\+?\d{10,15}$", cleaned):
        return False, "Invalid phone number format"

    return True, ""


def validate_username(username: str) -> Tuple[bool, str]:
    """
    Validate username format
    Returns tuple of (is_valid, error_message)
    """
    if not username:
        return False, "Username is required"

    if len(username) < 3:
        return False, "Username must be at least 3 characters"

    if len(username) > 20:
        return False, "Username must be at most 20 characters"

    if not re.match(r"^[a-zA-Z][a-zA-Z0-9_]*$", username):
        return False, "Username must start with a letter and contain only letters, numbers, and underscores"

    return True, ""


def validate_password(password: str) -> Tuple[bool, str]:
    """
    Validate password strength
    Returns tuple of (is_valid, error_message)
    """
    if not password:
        return False, "Password is required"

    if len(password) < 8:
        return False, "Password must be at least 8 characters"

    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"

    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"

    if not re.search(r"\d", password):
        return False, "Password must contain at least one digit"

    return True, ""


# Naming convention violations for testing naming checker
def badNamingFunction():  # Should be snake_case
    """Function with bad naming"""
    pass


class lowercase_class:  # Should be PascalCase
    """Class with bad naming"""
    pass


CONSTANT_value = 100  # Inconsistent constant naming
