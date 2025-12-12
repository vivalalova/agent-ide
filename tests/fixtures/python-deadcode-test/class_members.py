"""
測試類別成員的 dead code 檢測
"""


class UserService:
    """User service with some unused members"""

    # DEADCODE: 未使用的類別變數
    _unused_cache = {}

    def __init__(self):
        self._users = []

    # 非 DEADCODE: 使用中的方法
    def add_user(self, name: str):
        """Add a user"""
        self._users.append(name)
        return self._validate_name(name)

    # 非 DEADCODE: 被 add_user 呼叫
    def _validate_name(self, name: str) -> bool:
        """Validate user name"""
        return len(name) > 0

    # DEADCODE: 未使用的私有方法
    def _unused_private_method(self):
        """This method is never called"""
        return "unused"

    # DEADCODE: 未使用的靜態方法
    @staticmethod
    def unused_static_method():
        """Unused static method"""
        return "static unused"

    # DEADCODE: 未使用的類別方法
    @classmethod
    def unused_class_method(cls):
        """Unused class method"""
        return cls._unused_cache


# 在模組層級使用 UserService
service = UserService()
service.add_user("test")
