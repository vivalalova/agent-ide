"""
Email service module
"""

from typing import List, Optional
from dataclasses import dataclass


@dataclass
class Email:
    """Email data class"""
    to: str
    subject: str
    body: str
    cc: Optional[List[str]] = None
    bcc: Optional[List[str]] = None


class EmailService:
    """Email service for sending notifications"""

    def __init__(self, smtp_host: str, smtp_port: int = 587):
        self._smtp_host = smtp_host
        self._smtp_port = smtp_port
        self._sent_emails: List[Email] = []

    def send_email(self, email: Email) -> bool:
        """Send an email"""
        if not self._validate_email(email.to):
            return False

        # Simulate sending
        self._sent_emails.append(email)
        return True

    def send_welcome_email(self, user_email: str, username: str) -> bool:
        """Send welcome email to new user"""
        email = Email(
            to=user_email,
            subject="Welcome!",
            body=f"Hello {username}, welcome to our platform!"
        )
        return self.send_email(email)

    def send_order_confirmation(self, user_email: str, order_id: int) -> bool:
        """Send order confirmation email"""
        email = Email(
            to=user_email,
            subject=f"Order #{order_id} Confirmed",
            body=f"Your order #{order_id} has been confirmed."
        )
        return self.send_email(email)

    def send_bulk_emails(self, emails: List[Email]) -> int:
        """Send multiple emails and return count of successful sends"""
        success_count = 0
        for email in emails:
            if self.send_email(email):
                success_count += 1
        return success_count

    def _validate_email(self, email: str) -> bool:
        """Validate email format"""
        return "@" in email and "." in email.split("@")[-1]

    def get_sent_count(self) -> int:
        """Get count of sent emails"""
        return len(self._sent_emails)
