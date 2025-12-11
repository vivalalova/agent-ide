"""
Session State Key enumeration module.
Testing str, Enum multiple inheritance pattern with snake_case members.
"""

from enum import Enum


class GroupDataKey(str, Enum):
    """Group data keys for state management."""

    ess_vars = "ess_vars"  # ESS variables
    capex = "capex"  # CapEx variables
    price_vars = "price_vars"  # Price environment settings


class KEY(str, Enum):
    """Session State Key enumeration.

    This pattern uses (str, Enum) multiple inheritance,
    which is common in Python for string-based enums.
    """

    # ===== Global State =====
    user_data = "user_data"  # User basic data and contract info
    industry_factor = "industry_factor"  # Industry price adjustment factor
    company_name = "company_name"  # Company name
    factory_name = "factory_name"  # Factory name
    selected_company = "selected_company"  # Sidebar selected user
    current_page = "current_page"  # Current page ('main_vars' or 'analysis')
    theme = "theme"  # UI theme ('light' or 'dark')

    # ===== Price Environment (price_vars) =====
    price_vars_confirmed = "price_vars_confirmed"  # Confirmation status
    confirmed_price_vars = "confirmed_price_vars"  # Confirmed data
    electricity_growth_rate = "electricity_growth_rate"  # Electricity price CAGR (%)

    # ===== ESS Variables (ess_vars) =====
    ess_vars_confirmed = "ess_vars_confirmed"  # Confirmation status
    confirmed_ess_vars = "confirmed_ess_vars"  # Confirmed data
    battery_capacity = "battery_capacity"  # Battery capacity (kWh)
    pcs_capacity = "pcs_capacity"  # PCS capacity (kW)


def get_key_value(key: KEY) -> str:
    """Get the string value of a KEY enum member."""
    return key.value


def validate_key(key_name: str) -> bool:
    """Validate if a key name exists in KEY enum."""
    try:
        KEY(key_name)
        return True
    except ValueError:
        return False
