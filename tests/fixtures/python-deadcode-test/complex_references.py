"""
測試複雜引用情況
"""
from typing import List, Optional


# 非 DEADCODE: 被 process_items 使用
def transform_item(item: str) -> str:
    """Transform a single item"""
    return item.upper()


# 非 DEADCODE: 被外部使用
def process_items(items: List[str]) -> List[str]:
    """Process a list of items"""
    return [transform_item(item) for item in items]


# DEADCODE: 定義了但沒有使用
def unused_transformer(value: int) -> int:
    """Unused transformer function"""
    return value * 2


# 非 DEADCODE: 被 create_processor 使用
class Processor:
    """Processor class"""

    def __init__(self, name: str):
        self.name = name

    def run(self):
        return f"Running {self.name}"


# 非 DEADCODE: 工廠函式
def create_processor(name: str) -> Processor:
    """Create a processor instance"""
    return Processor(name)


# DEADCODE: 未使用的工廠函式
def create_unused_processor() -> Processor:
    """Create an unused processor"""
    return Processor("unused")


# 使用這些函式
result = process_items(["a", "b", "c"])
processor = create_processor("main")
