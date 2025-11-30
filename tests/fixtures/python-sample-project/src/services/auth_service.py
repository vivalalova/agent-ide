"""
Authentication service module
Contains security-related code for testing security checker
"""

import hashlib
import pickle  # Security issue: pickle usage
from typing import Optional, Dict
import os

from ..models.user import User, UserRole


class AuthService:
    """Authentication service - contains some security issues for testing"""

    def __init__(self):
        self._sessions: Dict[str, User] = {}
        self._secret_key = "hardcoded_secret"  # Security issue: hardcoded secret

    def hash_password(self, password: str) -> str:
        """Hash password using MD5 - intentionally weak for testing"""
        # Security issue: weak hash algorithm
        return hashlib.md5(password.encode()).hexdigest()

    def verify_password(self, password: str, hashed: str) -> bool:
        """Verify password"""
        return self.hash_password(password) == hashed

    def login(self, username: str, password: str) -> Optional[str]:
        """Login user and return session token"""
        # This is a simplified example
        session_id = hashlib.sha256(f"{username}{password}".encode()).hexdigest()
        return session_id

    def logout(self, session_id: str) -> bool:
        """Logout user"""
        if session_id in self._sessions:
            del self._sessions[session_id]
            return True
        return False

    def execute_query(self, query: str) -> None:
        """Execute database query - SQL injection vulnerability for testing"""
        # Security issue: SQL injection
        sql = f"SELECT * FROM users WHERE name = '{query}'"
        print(sql)

    def load_config(self, data: bytes) -> dict:
        """Load configuration - pickle vulnerability for testing"""
        # Security issue: pickle deserialization
        return pickle.loads(data)

    def run_command(self, cmd: str) -> None:
        """Run system command - command injection for testing"""
        # Security issue: command injection
        os.system(cmd)

    def eval_expression(self, expr: str) -> any:
        """Evaluate expression - eval vulnerability for testing"""
        # Security issue: eval usage
        return eval(expr)


class TokenManager:
    """Token management"""

    def __init__(self, secret: str):
        self._secret = secret

    def generate_token(self, user_id: int) -> str:
        """Generate access token"""
        data = f"{user_id}:{self._secret}"
        return hashlib.sha256(data.encode()).hexdigest()

    def validate_token(self, token: str, user_id: int) -> bool:
        """Validate access token"""
        expected = self.generate_token(user_id)
        return token == expected
