import logging
import math
from celery import shared_task
from django.utils import timezone
from django.db import transaction

logger = logging.getLogger(__name__)


def _haversine_nm(lat1, lon1, lat2, lon2):
    R = 3440.065
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


@shared_task(bind=True)
def refresh_all_voyage_etas(self):
    from .models import Voyage
    active_voyages = Voyage.objects.filter(status='active').select_related(
        'barge', 'destination_port'
    )
    updated = 0
    for voyage in active_voyages:
        try:
            pos = voyage.barge.positions.order_by('-timestamp').first()
            if not pos:
                continue
            if pos.speed_over_ground < 0.5:
                continue
            remaining_nm = _haversine_nm(
                pos.latitude, pos.longitude,
                voyage.destination_port.latitude,
                voyage.destination_port.longitude,
            )
            eta_hours = remaining_nm / pos.speed_over_ground
            from datetime import timedelta
            new_eta = timezone.now() + timedelta(hours=eta_hours)
            voyage.estimated_arrival = new_eta
            voyage.last_known_position = {
                'lat': pos.latitude,
                'lon': pos.longitude,
                'speed': pos.speed_over_ground,
                'timestamp': pos.timestamp.isoformat(),
            }
            if voyage.estimated_arrival and timezone.now() > voyage.estimated_arrival + timedelta(hours=4):
                voyage.status = 'delayed'
            voyage.save(update_fields=['estimated_arrival', 'last_known_position', 'status'])
            updated += 1
        except Exception as e:
            logger.error(f'ETA refresh error for voyage {voyage.id}: {e}')
    return {'updated': updated}


@shared_task(bind=True, max_retries=3)
def complete_voyage(self, voyage_id: str):
    from .models import Voyage, VoyageEvent
    try:
        with transaction.atomic():
            voyage = Voyage.objects.get(id=voyage_id)
            voyage.status = 'completed'
            voyage.actual_arrival = timezone.now()
            voyage.save(update_fields=['status', 'actual_arrival'])
            VoyageEvent.objects.create(
                voyage=voyage,
                event_type='arrived',
                description=f'Voyage {voyage.voyage_number} completed at {voyage.destination_port.name}',
                latitude=voyage.destination_port.latitude,
                longitude=voyage.destination_port.longitude,
            )
        return {'voyage_id': voyage_id, 'status': 'completed'}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)
