import logging
import json
import math
import random
from datetime import timedelta
from typing import List, Dict, Optional

from celery import shared_task, group, chord
from django.utils import timezone
from django.core.cache import cache
from django.db import transaction
from django.contrib.gis.geos import Point

from .models import Vessel, VesselPosition, AnomalyLog, DeadLetterLog

logger = logging.getLogger(__name__)

INLAND_WATERWAY_BOUNDS = {
    'mississippi': {'lat_min': 29.0, 'lat_max': 47.0, 'lon_min': -92.0, 'lon_max': -88.0},
    'ohio': {'lat_min': 37.0, 'lat_max': 42.0, 'lon_min': -85.0, 'lon_max': -80.0},
    'tennessee': {'lat_min': 34.0, 'lat_max': 37.5, 'lon_min': -88.5, 'lon_max': -85.0},
    'illinois': {'lat_min': 38.0, 'lat_max': 42.5, 'lon_min': -90.5, 'lon_max': -87.5},
    'gulf_coast': {'lat_min': 28.5, 'lat_max': 31.0, 'lon_min': -97.0, 'lon_max': -88.0},
}


def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3440.065
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _simulate_ais_feed(mmsi_list: List[str]) -> List[Dict]:
    """
    Simulate realistic AIS position data using random walk algorithm.
    In production this calls MarineTraffic, Spire Maritime, or exactEarth API.
    """
    positions = []
    for mmsi in mmsi_list:
        cache_key = f'vessel:{mmsi}:sim_state'
        state = cache.get(cache_key)

        if not state:
            waterway = random.choice(list(INLAND_WATERWAY_BOUNDS.values()))
            state = {
                'lat': random.uniform(waterway['lat_min'], waterway['lat_max']),
                'lon': random.uniform(waterway['lon_min'], waterway['lon_max']),
                'speed': random.uniform(4.0, 12.0),
                'course': random.uniform(0, 360),
                'heading_drift': random.uniform(-2, 2),
            }

        speed_delta = random.gauss(0, 0.3)
        state['speed'] = max(0.5, min(8.5, state['speed'] + speed_delta))

        course_delta = random.gauss(0, state['heading_drift'])
        state['course'] = (state['course'] + course_delta) % 360

        distance_nm = state['speed'] * (300 / 3600)
        lat_delta = distance_nm * math.cos(math.radians(state['course'])) / 60
        lon_delta = distance_nm * math.sin(math.radians(state['course'])) / (60 * math.cos(math.radians(state['lat'])))

        state['lat'] = max(-89.9, min(89.9, state['lat'] + lat_delta))
        state['lon'] = max(-179.9, min(179.9, state['lon'] + lon_delta))

        cache.set(cache_key, state, timeout=3600)

        nav_status = 0 if state['speed'] > 0.5 else 1
        if state['speed'] < 0.2:
            nav_status = 5

        positions.append({
            'mmsi': mmsi,
            'lat': round(state['lat'], 6),
            'lon': round(state['lon'], 6),
            'speed_over_ground': round(state['speed'], 1),
            'course_over_ground': round(state['course'], 1),
            'heading': int(state['course']) % 360,
            'nav_status': nav_status,
            'timestamp': timezone.now().isoformat(),
        })

    return positions


def _validate_position(pos: Dict) -> Optional[str]:
    lat, lon = pos.get('lat'), pos.get('lon')
    if lat is None or lon is None:
        return 'missing_coordinates'
    if not (-90 <= lat <= 90):
        return 'invalid_latitude'
    if not (-180 <= lon <= 180):
        return 'invalid_longitude'
    if lat == 0 and lon == 0:
        return 'null_island'
    speed = pos.get('speed_over_ground', 0)
    if speed > 20:
        return 'impossible_speed'
    ts_str = pos.get('timestamp')
    if ts_str:
        from dateutil.parser import parse as parse_dt
        try:
            ts = parse_dt(ts_str)
            if ts.tzinfo is None:
                from datetime import timezone as tz
                ts = ts.replace(tzinfo=tz.utc)
            if ts > timezone.now() + timedelta(seconds=60):
                return 'future_timestamp'
        except Exception:
            return 'invalid_timestamp'
    return None


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def fetch_vessel_positions(self, mmsi_chunk: List[str]):
    try:
        raw_positions = _simulate_ais_feed(mmsi_chunk)
        validated = []
        failed = []

        for pos in raw_positions:
            error = _validate_position(pos)
            if error:
                failed.append({'data': pos, 'reason': error})
                continue
            validated.append(pos)

        if failed:
            DeadLetterLog.objects.bulk_create([
                DeadLetterLog(raw_data=f['data'], failure_reason=f['reason'], source='ais_feed')
                for f in failed
            ])

        if not validated:
            return {'processed': 0, 'failed': len(failed)}

        vessel_map = {
            v.mmsi: v for v in Vessel.objects.filter(mmsi__in=[p['mmsi'] for p in validated])
        }

        position_objects = []
        for pos in validated:
            vessel = vessel_map.get(pos['mmsi'])
            if not vessel:
                continue

            from dateutil.parser import parse as parse_dt
            from datetime import timezone as tz
            ts_raw = parse_dt(pos['timestamp'])
            if ts_raw.tzinfo is None:
                ts_raw = ts_raw.replace(tzinfo=tz.utc)

            position_objects.append(VesselPosition(
                vessel=vessel,
                position=Point(pos['lon'], pos['lat'], srid=4326),
                latitude=pos['lat'],
                longitude=pos['lon'],
                speed_over_ground=pos['speed_over_ground'],
                course_over_ground=pos['course_over_ground'],
                heading=pos.get('heading', 511),
                nav_status=pos.get('nav_status', 15),
                timestamp=ts_raw,
                source='ais_feed',
                raw_message=pos,
            ))

        with transaction.atomic():
            created = VesselPosition.objects.bulk_create(
                position_objects,
                ignore_conflicts=True,
            )

        pipeline = cache.client.pipeline() if hasattr(cache, 'client') else None
        for pos in validated:
            cache_key = f'vessel:{pos["mmsi"]}:latest_position'
            cache.set(cache_key, json.dumps(pos), timeout=600)

        logger.info(f'AIS ingestion: {len(created)} positions saved, {len(failed)} failed validation')
        return {'processed': len(created), 'failed': len(failed)}

    except Exception as exc:
        logger.error(f'AIS fetch error: {exc}')
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@shared_task(bind=True)
def fetch_all_vessel_positions(self):
    active_mmsis = list(
        Vessel.objects.filter(is_active=True).values_list('mmsi', flat=True)
    )

    if not active_mmsis:
        return {'message': 'No active vessels to track'}

    chunk_size = 50
    chunks = [active_mmsis[i:i + chunk_size] for i in range(0, len(active_mmsis), chunk_size)]

    job = group(fetch_vessel_positions.s(chunk) for chunk in chunks)
    result = job.apply_async(queue='ais_ingestion')
    return {'dispatched_chunks': len(chunks), 'total_vessels': len(active_mmsis)}


@shared_task(bind=True)
def run_anomaly_detection(self):
    cutoff = timezone.now() - timedelta(minutes=15)
    recent = VesselPosition.objects.filter(
        timestamp__gte=cutoff
    ).select_related('vessel').order_by('vessel_id', '-timestamp')

    seen = {}
    anomalies_to_create = []

    for pos in recent:
        vid = str(pos.vessel_id)
        if vid in seen:
            prev = seen[vid]
            time_delta_hours = (pos.timestamp - prev.timestamp).total_seconds() / 3600
            if time_delta_hours > 0:
                distance_nm = _haversine_distance(
                    prev.latitude, prev.longitude, pos.latitude, pos.longitude
                )
                implied_speed = distance_nm / time_delta_hours
                if implied_speed > 40:
                    anomalies_to_create.append(AnomalyLog(
                        vessel=pos.vessel,
                        anomaly_type='position_jump',
                        severity='high',
                        description=f'Position jump detected: {distance_nm:.1f}nm in {time_delta_hours * 60:.0f}min (implied {implied_speed:.0f}kts)',
                        position=Point(pos.longitude, pos.latitude, srid=4326),
                        latitude=pos.latitude,
                        longitude=pos.longitude,
                        metadata={'implied_speed_kts': implied_speed, 'distance_nm': distance_nm},
                    ))

            if pos.speed_over_ground > prev.speed_over_ground * 2.5 and pos.speed_over_ground > 20:
                anomalies_to_create.append(AnomalyLog(
                    vessel=pos.vessel,
                    anomaly_type='speed_spike',
                    severity='medium',
                    description=f'Speed spike: {prev.speed_over_ground:.1f}kts to {pos.speed_over_ground:.1f}kts',
                    position=Point(pos.longitude, pos.latitude, srid=4326),
                    latitude=pos.latitude,
                    longitude=pos.longitude,
                    metadata={'previous_speed': prev.speed_over_ground, 'current_speed': pos.speed_over_ground},
                ))
        else:
            seen[vid] = pos

    if anomalies_to_create:
        AnomalyLog.objects.bulk_create(anomalies_to_create, ignore_conflicts=True)

    return {'anomalies_detected': len(anomalies_to_create)}


@shared_task(bind=True, max_retries=2)
def fetch_real_ais_positions(self):
    """
    Fetch real vessel positions from aisstream.io.
    Falls back to simulation if API key not set.
    """
    import asyncio
    import os
    from django.conf import settings

    api_key = getattr(settings, 'AISSTREAM_API_KEY', '') or os.environ.get('AISSTREAM_API_KEY', '')
    if not api_key:
        logger.info('AISSTREAM_API_KEY not set — using simulation')
        return fetch_all_vessel_positions.apply_async()

    try:
        from vessels.ais_stream import ingest_real_ais

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        positions = loop.run_until_complete(ingest_real_ais(duration_seconds=55))
        loop.close()

        if isinstance(positions, dict) and 'error' in positions:
            logger.warning(f'Real AIS error: {positions["error"]} — falling back to simulation')
            return fetch_all_vessel_positions.apply_async()

        if not positions:
            logger.info('No real AIS positions received — falling back to simulation')
            return fetch_all_vessel_positions.apply_async()

        # Save real positions to DB
        validated = []
        failed = []
        for pos in positions:
            error = _validate_position(pos)
            if error:
                failed.append({'data': pos, 'reason': error})
                continue
            validated.append(pos)

        if failed:
            DeadLetterLog.objects.bulk_create([
                DeadLetterLog(raw_data=f['data'], failure_reason=f['reason'], source='aisstream.io')
                for f in failed
            ], ignore_conflicts=True)

        if not validated:
            return {'real_positions': 0, 'failed': len(failed)}

        # Upsert vessels from real data
        from django.contrib.gis.geos import Point
        from dateutil.parser import parse as parse_dt
        from datetime import timezone as tz_mod

        mmsis = [p['mmsi'] for p in validated]
        vessel_map = {v.mmsi: v for v in Vessel.objects.filter(mmsi__in=mmsis)}

        new_vessels = []
        for pos in validated:
            if pos['mmsi'] not in vessel_map:
                new_vessels.append(Vessel(
                    mmsi=pos['mmsi'],
                    name=pos.get('name', f"Vessel {pos['mmsi']}"),
                    vessel_type='cargo',
                    flag='US',
                    is_active=True,
                ))

        if new_vessels:
            created = Vessel.objects.bulk_create(new_vessels, ignore_conflicts=True)
            for v in Vessel.objects.filter(mmsi__in=[v.mmsi for v in new_vessels]):
                vessel_map[v.mmsi] = v

        position_objects = []
        for pos in validated:
            vessel = vessel_map.get(pos['mmsi'])
            if not vessel:
                continue
            ts = parse_dt(pos['timestamp'])
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=tz_mod.utc)
            position_objects.append(VesselPosition(
                vessel=vessel,
                position=Point(pos['lon'], pos['lat'], srid=4326),
                latitude=pos['lat'],
                longitude=pos['lon'],
                speed_over_ground=pos['speed_over_ground'],
                course_over_ground=pos['course_over_ground'],
                heading=pos.get('heading', 511),
                nav_status=pos.get('nav_status', 15),
                timestamp=ts,
                source='aisstream.io',
                raw_message=pos,
            ))

        from django.db import transaction
        import json as json_mod
        with transaction.atomic():
            VesselPosition.objects.bulk_create(position_objects, ignore_conflicts=True)

        # Update Redis cache
        for pos in validated:
            from django.core.cache import cache
            cache.set(f'vessel:{pos["mmsi"]}:latest_position', json_mod.dumps(pos), timeout=600)

        logger.info(f'Real AIS: {len(position_objects)} positions saved from aisstream.io')
        return {'real_positions': len(position_objects), 'failed': len(failed), 'source': 'aisstream.io'}

    except Exception as exc:
        logger.error(f'Real AIS task error: {exc}')
        raise self.retry(exc=exc, countdown=30)
