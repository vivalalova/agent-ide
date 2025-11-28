"""
User model tests
"""

import pytest
from src.models.user import User, UserRole, UserManager


class TestUser:
    """Test cases for User class"""

    def test_create_user(self):
        """Test user creation"""
        user = User(id=1, username="testuser", email="test@example.com")
        assert user.id == 1
        assert user.username == "testuser"
        assert user.email == "test@example.com"
        assert user.role == UserRole.USER

    def test_is_admin(self):
        """Test admin check"""
        admin = User(id=1, username="admin", email="admin@example.com", role=UserRole.ADMIN)
        user = User(id=2, username="user", email="user@example.com")

        assert admin.is_admin() is True
        assert user.is_admin() is False

    def test_validate_email(self):
        """Test email validation"""
        assert User.validate_email("valid@example.com") is True
        assert User.validate_email("invalid") is False
        assert User.validate_email("no-at-sign.com") is False


class TestUserManager:
    """Test cases for UserManager class"""

    def test_add_user(self):
        """Test adding user"""
        manager = UserManager()
        user = User(id=1, username="test", email="test@example.com")
        manager.add_user(user)
        assert manager.count_users() == 1

    def test_find_by_id(self):
        """Test finding user by ID"""
        manager = UserManager()
        user = User(id=1, username="test", email="test@example.com")
        manager.add_user(user)

        found = manager.find_by_id(1)
        assert found is not None
        assert found.username == "test"

        not_found = manager.find_by_id(999)
        assert not_found is None
