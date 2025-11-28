"""
User model module
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional, List
from datetime import datetime


class UserRole(Enum):
    """User role enumeration"""
    ADMIN = "admin"
    USER = "user"
    GUEST = "guest"


@dataclass
class User:
    """User data class"""
    id: int
    username: str
    email: str
    role: UserRole = UserRole.USER
    created_at: Optional[datetime] = None

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now()

    def is_admin(self) -> bool:
        """Check if user is admin"""
        return self.role == UserRole.ADMIN

    def get_display_name(self) -> str:
        """Get display name"""
        return f"{self.username} ({self.email})"

    @staticmethod
    def validate_email(email: str) -> bool:
        """Validate email format"""
        return "@" in email and "." in email


class UserManager:
    """User management class"""

    def __init__(self):
        self._users: List[User] = []
        self._unused_field = "this is unused"  # Unused variable for testing

    def add_user(self, user: User) -> None:
        """Add a user"""
        if not User.validate_email(user.email):
            raise ValueError("Invalid email")
        self._users.append(user)

    def find_by_id(self, user_id: int) -> Optional[User]:
        """Find user by ID"""
        for user in self._users:
            if user.id == user_id:
                return user
        return None

    def find_by_email(self, email: str) -> Optional[User]:
        """Find user by email"""
        for user in self._users:
            if user.email == email:
                return user
        return None

    def get_admins(self) -> List[User]:
        """Get all admin users"""
        return [u for u in self._users if u.is_admin()]

    def count_users(self) -> int:
        """Count total users"""
        return len(self._users)


def unused_function():
    """This function is never used - for dead code detection"""
    pass


# Constant for testing
MAX_USERS = 1000
DEFAULT_ROLE = UserRole.USER
