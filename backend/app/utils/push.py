"""
Expo Push Notification helper.

Expo's push API accepts batches of up to 100 messages.
https://docs.expo.dev/push-notifications/sending-notifications/
"""
import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _is_expo_token(token: str) -> bool:
    return token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken[")


def send_push(token: str, title: str, body: str, data: Optional[dict] = None) -> bool:
    """Send a single Expo push notification. Returns True on success."""
    if not token or not _is_expo_token(token):
        return False
    return send_push_batch([{"to": token, "title": title, "body": body, "data": data or {}}])


def send_push_batch(messages: list[dict]) -> bool:
    """
    Send up to 100 Expo push messages in one HTTP call.
    Each message dict must have at minimum: to, title, body.
    """
    if not messages:
        return True
    # Filter out invalid tokens
    valid = [m for m in messages if m.get("to") and _is_expo_token(m["to"])]
    if not valid:
        return True
    try:
        resp = httpx.post(
            EXPO_PUSH_URL,
            json=valid,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=15,
        )
        if resp.status_code != 200:
            logger.warning("Expo push returned %s: %s", resp.status_code, resp.text[:200])
            return False
        result = resp.json()
        errors = [r for r in result.get("data", []) if r.get("status") == "error"]
        if errors:
            logger.warning("Expo push errors: %s", errors[:3])
        return True
    except Exception as exc:
        logger.error("Expo push failed: %s", exc)
        return False
