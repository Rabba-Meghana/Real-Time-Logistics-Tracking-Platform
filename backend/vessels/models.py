from django.db import models
from django.contrib.gis.db import models as gis_models
from django.utils import timezone
import uuid


class Vessel(models.Model):
    VESSEL_TYPES = [
        ('cargo', 'Cargo'),
        ('tanker', 'Tanker'),
        ('barge', 'Barge'),
        ('tug', 'Tug'),
        ('passenger', 'Passenger'),
        ('fishing', 'Fishing'),
        ('other', 'Other'),
    ]

    NAV_STATUS = [
        (0, 'Under Way Engine'),
        (1, 'At Anchor'),
        (2, 'Not Under Command'),
        (3, 'Restricted Manoeuvrability'),
        (5, 'Moored'),
        (8, 'Sailing'),
        (15, 'Unknown'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mmsi = models.CharField(max_length=9, unique=True, db_index=True)
    imo = models.CharField(max_length=10, blank=True)
    name = models.CharField(max_length=200)
    callsign = models.CharField(max_length=20, blank=True)
    vessel_type = models.CharField(max_length=20, choices=VESSEL_TYPES, default='cargo')
    flag = models.CharField(max_length=3, blank=True)
    length = models.FloatField(null=True, blank=True)
    width = models.FloatField(null=True, blank=True)
    draft = models.FloatField(null=True, blank=True)
    gross_tonnage = models.IntegerField(null=True, blank=True)
    nav_status = models.IntegerField(choices=NAV_STATUS, default=15)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'vessels'
        indexes = [
            models.Index(fields=['mmsi']),
            models.Index(fields=['vessel_type']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f'{self.name} ({self.mmsi})'

    @property
    def latest_position(self):
        return self.positions.order_by('-timestamp').first()


class VesselPosition(models.Model):
    id = models.BigAutoField(primary_key=True)
    vessel = models.ForeignKey(Vessel, on_delete=models.CASCADE, related_name='positions', db_index=True)
    position = gis_models.PointField(geography=True, srid=4326)
    latitude = models.FloatField()
    longitude = models.FloatField()
    speed_over_ground = models.FloatField(default=0)
    course_over_ground = models.FloatField(default=0)
    heading = models.IntegerField(default=511)
    nav_status = models.IntegerField(default=15)
    timestamp = models.DateTimeField(db_index=True)
    source = models.CharField(max_length=50, default='ais_feed')
    raw_message = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'vessel_positions'
        unique_together = [('vessel', 'timestamp')]
        indexes = [
            models.Index(fields=['vessel', 'timestamp']),
            models.Index(fields=['timestamp']),
        ]
        ordering = ['-timestamp']

    def __str__(self):
        return f'{self.vessel.name} @ {self.timestamp}'


class AnomalyLog(models.Model):
    ANOMALY_TYPES = [
        ('speed_spike', 'Speed Spike'),
        ('position_jump', 'Position Jump'),
        ('unexpected_stop', 'Unexpected Stop'),
        ('geofence_breach', 'Geofence Breach'),
        ('route_deviation', 'Route Deviation'),
    ]

    SEVERITY = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('critical', 'Critical'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    vessel = models.ForeignKey(Vessel, on_delete=models.CASCADE, related_name='anomalies')
    anomaly_type = models.CharField(max_length=30, choices=ANOMALY_TYPES)
    severity = models.CharField(max_length=10, choices=SEVERITY, default='medium')
    description = models.TextField()
    position = gis_models.PointField(geography=True, srid=4326, null=True)
    latitude = models.FloatField(null=True)
    longitude = models.FloatField(null=True)
    detected_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True)
    is_resolved = models.BooleanField(default=False)
    metadata = models.JSONField(default=dict)

    class Meta:
        db_table = 'anomaly_logs'
        indexes = [
            models.Index(fields=['vessel', 'detected_at']),
            models.Index(fields=['anomaly_type', 'severity']),
            models.Index(fields=['is_resolved']),
        ]
        ordering = ['-detected_at']


class DeadLetterLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    raw_data = models.JSONField()
    failure_reason = models.CharField(max_length=200)
    source = models.CharField(max_length=50)
    received_at = models.DateTimeField(auto_now_add=True)
    retry_count = models.IntegerField(default=0)

    class Meta:
        db_table = 'dead_letter_logs'
        ordering = ['-received_at']


class Port(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=10, unique=True)
    country = models.CharField(max_length=100)
    position = gis_models.PointField(geography=True, srid=4326)
    latitude = models.FloatField()
    longitude = models.FloatField()
    is_inland = models.BooleanField(default=False)
    timezone = models.CharField(max_length=50, default='UTC')

    class Meta:
        db_table = 'ports'
        indexes = [
            models.Index(fields=['code']),
        ]

    def __str__(self):
        return f'{self.name} ({self.code})'
