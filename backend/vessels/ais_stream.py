"""
Real AIS data ingestion from aisstream.io WebSocket feed.
Wide US bounding box — covers inland waterways, Gulf Coast, and East Coast.
Persistent reconnect loop — never falls back to simulation.
API key from environment — never hardcoded.
"""
import asyncio
import json
import logging
import os
from datetime import timezone as tz
from datetime import datetime

import websockets
from django.conf import settings

logger = logging.getLogger(__name__)

# Wide US bounding box: covers all US waters — inland, Gulf, East Coast, West Coast
AIS_BOUNDING_BOXES = [
    [[24.0, -125.0], [49.0, -66.0]],   # Continental US
    [[17.0, -97.0],  [24.0, -80.0]],   # Gulf of Mexico approaches
]

MAX_RECONNECT_DELAY = 30  # seconds


def _parse_position(msg: dict) -> dict | None:
    """Extract and validate a position dict from an aisstream.io message."""
    meta = msg.get("MetaData", {})
    pos = msg.get("Message", {}).get("PositionReport", {})

    lat = meta.get("latitude") or pos.get("Latitude")
    lon = meta.get("longitude") or pos.get("Longitude")

    if lat is None or lon is None:
        return None
    try:
        lat = float(lat)
        lon = float(lon)
    except (TypeError, ValueError):
        return None

    if lat == 0.0 and lon == 0.0:
        return None
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return None

    mmsi = str(meta.get("MMSI") or pos.get("UserID") or "")
    if not mmsi:
        return None

    return {
        "mmsi": mmsi,
        "name": (meta.get("ShipName") or "Unknown").strip(),
        "lat": round(lat, 6),
        "lon": round(lon, 6),
        "speed_over_ground": round(float(pos.get("SpeedOverGround") or 0), 1),
        "course_over_ground": round(float(pos.get("CourseOverGround") or 0), 1),
        "heading": int(pos.get("TrueHeading") or 511),
        "nav_status": int(pos.get("NavigationalStatus") or 15),
        "timestamp": datetime.now(tz.utc).isoformat(),
        "source": "aisstream.io",
    }


async def stream_ais_positions(api_key: str, callback, duration_seconds: int = 60):
    """
    Connect to aisstream.io with automatic reconnection.
    Calls callback(position_dict) for each valid position received.
    Runs until duration_seconds elapses, reconnecting on any drop.
    """
    url = "wss://stream.aisstream.io/v0/stream"
    subscribe_msg = {
        "APIKey": api_key,
        "BoundingBoxes": AIS_BOUNDING_BOXES,
        "FilterMessageTypes": ["PositionReport"],
    }

    reconnect_delay = 2
    start_time = asyncio.get_event_loop().time()

    while True:
        elapsed = asyncio.get_event_loop().time() - start_time
        remaining = duration_seconds - elapsed
        if remaining <= 0:
            break

        try:
            logger.info(f"Connecting to aisstream.io ({int(elapsed)}s elapsed, {int(remaining)}s remaining)...")
            async with websockets.connect(
                url,
                ping_interval=20,
                ping_timeout=15,
                close_timeout=5,
                open_timeout=20,
            ) as ws:
                await ws.send(json.dumps(subscribe_msg))
                logger.info("Subscribed to aisstream.io — receiving real vessel positions...")
                reconnect_delay = 2  # reset on successful connect

                try:
                    while True:
                        elapsed = asyncio.get_event_loop().time() - start_time
                        remaining = duration_seconds - elapsed
                        if remaining <= 0:
                            return

                        try:
                            raw = await asyncio.wait_for(ws.recv(), timeout=min(15, remaining))
                        except asyncio.TimeoutError:
                            # No data for 15s — connection may be idle, keep waiting
                            logger.debug("AIS: no message in 15s, still connected, waiting...")
                            continue

                        try:
                            msg = json.loads(raw)
                        except json.JSONDecodeError:
                            continue

                        msg_type = msg.get("MessageType")
                        if msg_type != "PositionReport":
                            # Log non-position messages (auth errors, etc.)
                            if msg_type:
                                logger.debug(f"AIS non-position message: {msg_type} — {str(msg)[:150]}")
                            continue

                        position = _parse_position(msg)
                        if position:
                            await callback(position)

                except websockets.ConnectionClosed as e:
                    logger.warning(f"AIS connection closed: {e} — will reconnect in {reconnect_delay}s")

        except (websockets.WebSocketException, OSError, ConnectionError) as e:
            logger.warning(f"AIS connection error: {e} — retrying in {reconnect_delay}s")
        except Exception as e:
            logger.error(f"AIS unexpected error: {e} — retrying in {reconnect_delay}s")

        elapsed = asyncio.get_event_loop().time() - start_time
        remaining = duration_seconds - elapsed
        if remaining <= 0:
            break

        sleep_time = min(reconnect_delay, remaining)
        await asyncio.sleep(sleep_time)
        reconnect_delay = min(reconnect_delay * 2, MAX_RECONNECT_DELAY)


async def ingest_real_ais(duration_seconds: int = 55):
    """
    Pull real AIS positions for duration_seconds from aisstream.io.
    Returns list of position dicts. Never falls back to simulation.
    Called by Celery task.
    """
    api_key = getattr(settings, "AISSTREAM_API_KEY", "") or os.environ.get("AISSTREAM_API_KEY", "")
    if not api_key:
        logger.error("AISSTREAM_API_KEY not set — cannot ingest real AIS data")
        return {"error": "no_api_key"}

    positions = []

    async def collect(pos):
        positions.append(pos)
        if len(positions) % 50 == 0:
            logger.info(f"AIS: collected {len(positions)} real positions so far...")

    try:
        await stream_ais_positions(api_key, collect, duration_seconds=duration_seconds)
    except Exception as e:
        logger.error(f"AIS ingest error: {e}")
        if not positions:
            return {"error": str(e)}

    logger.info(f"AIS ingest complete: {len(positions)} real positions collected")
    return positions
