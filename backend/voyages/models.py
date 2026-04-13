from django.db import models
from django.contrib.gis.db import models as gis_models
from django.utils import timezone
import uuid
import math


def haversine_nm(lat1, lon1, lat2, lon2):
    R = 3440.065
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


class Voyage(models.Model):
    STATUS_CHOICES = [
        ('planned', 'Planned'),
        ('active', 'Active'),
        ('delayed', 'Delayed'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    CARGO_TYPES = [
        ('grain', 'Grain'),
        ('coal', 'Coal'),
        ('petroleum', 'Petroleum'),
        ('chemicals', 'Chemicals'),
        ('containers', 'Containers'),
        ('steel', 'Steel'),
        ('aggregate', 'Aggregate'),
        ('fertilizer', 'Fertilizer'),
        ('other', 'Other'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    voyage_number = models.CharField(max_length=20, unique=True, db_index=True)
    barge = models.ForeignKey('vessels.Vessel', on_delete=models.PROTECT, related_name='voyages')
    origin_port = models.ForeignKey('vessels.Port', on_delete=models.PROTECT, related_name='departures')
    destination_port = models.ForeignKey('vessels.Port', on_delete=models.PROTECT, related_name='arrivals')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planned', db_index=True)
    cargo_type = models.CharField(max_length=20, choices=CARGO_TYPES, default='other')
    cargo_weight_tons = models.FloatField(default=0)
    cargo_description = models.TextField(blank=True)
    departure_date = models.DateTimeField()
    estimated_arrival = models.DateTimeField(null=True, blank=True)
    actual_arrival = models.DateTimeField(null=True, blank=True)
    planned_route = gis_models.LineStringField(geography=True, srid=4326, null=True, blank=True)
    last_known_position = models.JSONField(null=True, blank=True)
    distance_nm = models.FloatField(null=True, blank=True)
    agreed_rate_per_ton = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    fuel_surcharge = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    port_fees_agreed = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_agreed_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'voyages'
        indexes = [
            models.Index(fields=['status', 'departure_date']),
            models.Index(fields=['barge', 'status']),
            models.Index(fields=['departure_date']),
        ]
        ordering = ['-departure_date']

    def __str__(self):
        return f'{self.voyage_number}: {self.origin_port.code} -> {self.destination_port.code}'

    def save(self, *args, **kwargs):
        if not self.voyage_number:
            import random
            self.voyage_number = f'VYG-{timezone.now().year}-{random.randint(10000, 99999)}'
        if self.origin_port_id and self.destination_port_id:
            try:
                self.distance_nm = haversine_nm(
                    self.origin_port.latitude, self.origin_port.longitude,
                    self.destination_port.latitude, self.destination_port.longitude
                )
            except Exception:
                pass
        super().save(*args, **kwargs)

    @property
    def duration_days(self):
        if self.actual_arrival:
            return (self.actual_arrival - self.departure_date).total_seconds() / 86400
        if self.estimated_arrival:
            return (self.estimated_arrival - self.departure_date).total_seconds() / 86400
        return None

    @property
    def is_delayed(self):
        if self.status == 'active' and self.estimated_arrival:
            return timezone.now() > self.estimated_arrival
        return False


class VoyageEvent(models.Model):
    EVENT_TYPES = [
        ('departed', 'Departed'),
        ('arrived', 'Arrived'),
        ('waypoint_reached', 'Waypoint Reached'),
        ('weather_delay', 'Weather Delay'),
        ('mechanical_issue', 'Mechanical Issue'),
        ('lock_delay', 'Lock Delay'),
        ('cargo_loaded', 'Cargo Loaded'),
        ('cargo_discharged', 'Cargo Discharged'),
        ('inspection', 'Inspection'),
        ('route_change', 'Route Change'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    voyage = models.ForeignKey(Voyage, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=30, choices=EVENT_TYPES)
    description = models.TextField()
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)
    recorded_by = models.CharField(max_length=100, blank=True)
    metadata = models.JSONField(default=dict)

    class Meta:
        db_table = 'voyage_events'
        ordering = ['-occurred_at']
