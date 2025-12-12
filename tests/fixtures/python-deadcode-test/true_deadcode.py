"""
這個文件包含真正的 deadcode（未使用的符號）
"""


# DEADCODE: 未使用的函式
def unused_function():
    """This function is never called"""
    return "This function is never called"


# DEADCODE: 未使用的變數
unused_variable = "This variable is never referenced"


# DEADCODE: 未使用的類別
class UnusedClass:
    """This class is never instantiated"""

    def __init__(self, data: str):
        self.data = data

    def get_data(self) -> str:
        return self.data


# DEADCODE: 未使用的常數
UNUSED_CONSTANT = 42


# DEADCODE: 未使用的 lambda
unused_lambda = lambda x: x * 2


# DEADCODE: 未使用的 async 函式
async def unused_async_function():
    """Unused async function"""
    return "async result"


# DEADCODE: 未使用的內部類別
class UnusedInternalClass:
    """Internal class that is never used"""

    @staticmethod
    def helper():
        return "helper"


# 非 DEADCODE: 已使用的函式
def used_function():
    """This function is used"""
    return "This function is used"


# 非 DEADCODE: 內部使用的函式
def internal_helper():
    """Helper function"""
    return "helper"


def public_function():
    """Public function that uses internal_helper"""
    return internal_helper()
