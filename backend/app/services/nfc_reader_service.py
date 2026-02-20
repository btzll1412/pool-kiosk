"""
NFC Reader Service - WebSocket client management for card scan broadcasts.

This service manages WebSocket connections from admin browsers and broadcasts
NFC card scan events when cards are tapped at the kiosk.
"""
import logging
from typing import Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# Set of connected WebSocket clients
connected_clients: Set[WebSocket] = set()


async def register_client(websocket: WebSocket) -> None:
    """Register a new WebSocket client for card scan broadcasts."""
    connected_clients.add(websocket)
    logger.info("NFC WebSocket client connected. Total clients: %d", len(connected_clients))


async def unregister_client(websocket: WebSocket) -> None:
    """Unregister a WebSocket client."""
    connected_clients.discard(websocket)
    logger.info("NFC WebSocket client disconnected. Total clients: %d", len(connected_clients))


async def broadcast_card_scan(uid: str) -> int:
    """
    Broadcast a card scan event to all connected admin browsers.

    Args:
        uid: The RFID/NFC card UID that was scanned

    Returns:
        Number of clients successfully notified
    """
    if not connected_clients:
        logger.debug("No connected clients to broadcast card scan")
        return 0

    success_count = 0
    failed_clients = []

    for client in list(connected_clients):
        try:
            await client.send_json({"event": "card_scan", "uid": uid})
            success_count += 1
        except Exception as e:
            logger.warning("Failed to send to client: %s", e)
            failed_clients.append(client)

    # Clean up failed clients
    for client in failed_clients:
        connected_clients.discard(client)

    logger.info("Broadcast card scan UID=%s to %d clients", uid, success_count)
    return success_count


def get_client_count() -> int:
    """Return the number of connected WebSocket clients."""
    return len(connected_clients)
