"""
Real AIS data ingestion from aisstream.io WebSocket feed.
Filters for US inland waterway bounding boxes.
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

# US inland waterway bounding boxes
# aisstream.io format: [[minLat, minLon], [maxLat, maxLon]]
INLAND_WATERWAY_BOXES = [
    [[24.0, -98.0], [49.0, -66.0]]
]


async def stream_ais_positions(api_key: str, callback):
    """
    Connect to aisstream.io and stream real AIS positions.
    Calls callback(position_dict) for each valid position received.
    """
    url = "wss://stream.aisstream.io/v0/stream"
    subscribe_msg = {
        "APIKey": api_key,
        "BoundingBoxes": INLAND_WATERWAY_BOXES,
        "FilterMessageTypes": ["PositionReport"],
    }

    logger.info("Connecting to aisstream.io for real AIS data...")

    async with websockets.connect(url, ping_interval=20, close_timeout=10, open_timeout=30) as ws:
        await ws.send(json.dumps(subscribe_msg))
        logger.info("Subscribed to aisstream.io — waiting for vessels...")

        # Read first message — may be an error or confirmation
        try:
            first_raw = await asyncio.wait_for(ws.recv(), timeout=8)
            first_msg = json.loads(first_raw)
            msg_type = first_msg.get("MessageType", "")
            logger.info(f"AIS first message: {msg_type} — {str(first_msg)[:200]}")
            # If it is a position report, process it
            if msg_type == "PositionReport":
                meta = first_msg.get("MetaData", {})
                pos_data = first_msg.get("Message", {}).get("PositionReport", {})
                lat = meta.get("latitude") or pos_data.get("Latitude")
                lon = meta.get("longitude") or pos_data.get("Longitude")
                if lat and lon:
                    await callback({
                        "mmsi": str(meta.get("MMSI", "")),
                        "name": meta.get("ShipName", "Unknown").strip(),
                        "lat": round(float(lat), 6), "lon": round(float(lon), 6),
                        "speed_over_ground": round(float(pos_data.get("SpeedOverGround", 0)), 1),
                        "course_over_ground": round(float(pos_data.get("CourseOverGround", 0)), 1),
                        "heading": int(pos_data.get("TrueHeading", 511)),
                        "nav_status": int(pos_data.get("NavigationalStatus", 15)),
                        "timestamp": datetime.now(tz.utc).isoformat(), "source": "aisstream.io",
                    })
        except asyncio.TimeoutError:
            logger.warning("AIS: no first message in 5s — connection may be rejected")
        except Exception as e:
            logger.warning(f"AIS first message error: {e}")

        async for raw in ws:
            try:
                msg = json.loads(raw)
                msg_type = msg.get("MessageType")
                if msg_type != "PositionReport":
                    continue

                meta = msg.get("MetaData", {})
                pos = msg.get("Message", {}).get("PositionReport", {})

                lat = meta.get("latitude") or pos.get("Latitude")
                lon = meta.get("longitude") or pos.get("Longitude")

                if lat is None or lon is None:
                    continue
                if lat == 0.0 and lon == 0.0:
                    continue
                if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                    continue

                position = {
                    "mmsi": str(meta.get("MMSI", pos.get("UserID", ""))),
                    "name": meta.get("ShipName", "Unknown").strip(),
                    "lat": round(float(lat), 6),
                    "lon": round(float(lon), 6),
                    "speed_over_ground": round(float(pos.get("SpeedOverGround", 0)), 1),
                    "course_over_ground": round(float(pos.get("CourseOverGround", 0)), 1),
                    "heading": int(pos.get("TrueHeading", 511)),
                    "nav_status": int(pos.get("NavigationalStatus", 15)),
                    "timestamp": datetime.now(tz.utc).isoformat(),
                    "source": "aisstream.io",
                }

                await callback(position)

            except Exception as e:
                logger.warning(f"AIS parse error: {e}")
                continue


async def ingest_real_ais(duration_seconds: int = 60):
    """
    Pull real AIS positions for duration_seconds, save to DB.
    Called by Celery task.
    """
    import django
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

    api_key = getattr(settings, "AISSTREAM_API_KEY", "") or os.environ.get("AISSTREAM_API_KEY", "")
    if not api_key:
        logger.warning("AISSTREAM_API_KEY not set — skipping real AIS ingestion")
        return {"error": "no_api_key"}

    positions = []

    async def collect(pos):
        positions.append(pos)

    try:
        await asyncio.wait_for(
            stream_ais_positions(api_key, collect),
            timeout=duration_seconds,
        )
    except asyncio.TimeoutError:
        pass  # Normal — we collect for duration then process
    except Exception as e:
        logger.error(f"AIS stream error: {e}")
        if not positions:
            return {"error": str(e)}

    logger.info(f"Collected {len(positions)} real AIS positions")
    return positions
