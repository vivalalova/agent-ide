"""
State Manager module.
Uses KEY enum from config.session_keys.
"""

from typing import Any
from ..config.session_keys import KEY, GroupDataKey


class StateManager:
    """Manages application state using KEY enum."""

    def __init__(self) -> None:
        self._state: dict[str, Any] = {}
        self._initialize_defaults()

    def _initialize_defaults(self) -> None:
        """Initialize default values."""
        self._state[KEY.user_data] = None
        self._state[KEY.company_name] = ""
        self._state[KEY.theme] = "light"
        self._state[KEY.current_page] = "main_vars"

    def get(self, key: KEY) -> Any:
        """Get state value by key."""
        return self._state.get(key)

    def set(self, key: KEY, value: Any) -> None:
        """Set state value by key."""
        self._state[key] = value

    def get_user_data(self) -> Any:
        """Get user data."""
        return self._state.get(KEY.user_data)

    def set_user_data(self, data: Any) -> None:
        """Set user data."""
        self._state[KEY.user_data] = data

    def get_group_data(self, group: GroupDataKey) -> dict[str, Any]:
        """Get group data."""
        return self._state.get(group, {})


def create_state_manager() -> StateManager:
    """Factory function to create StateManager instance."""
    return StateManager()
