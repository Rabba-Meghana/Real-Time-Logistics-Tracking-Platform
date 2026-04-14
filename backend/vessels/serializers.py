from rest_framework import serializers
from django.core.cache import cache
import json
from .models import Vessel, VesselPosition, AnomalyLog, Port


class VesselPositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = VesselPosition
        fields = [
            'id', 'latitude', 'longitude', 'speed_over_ground',
            'course_over_ground', 'heading', 'nav_status', 'timestamp', 'source',
        ]


class VesselSerializer(serializers.ModelSerializer):
    latest_position = serializers.SerializerMethodField()
    position_count = serializers.SerializerMethodField()

    class Meta:
        model = Vessel
        fields = [
            'id', 'mmsi', 'imo', 'name', 'callsign', 'vessel_type', 'flag',
            'length', 'width', 'draft', 'gross_tonnage', 'nav_status',
            'is_active', 'latest_position', 'position_count',
            'created_at', 'updated_at',
        ]

    def get_latest_position(self, obj):
        cache_key = f'vessel:{obj.mmsi}:latest_position'
        cached = cache.get(cache_key)
        if cached:
            try:
                data = json.loads(cached)
                # Normalize to always have latitude/longitude keys
                if 'lat' in data and 'latitude' not in data:
                    data['latitude'] = data['lat']
                    data['longitude'] = data['lon']
                return data
            except Exception:
                pass
        pos = obj.positions.order_by('-timestamp').first()
        if pos:
            return VesselPositionSerializer(pos).data
        return None

    def get_position_count(self, obj):
        return obj.positions.count()


class VesselPositionHistorySerializer(serializers.ModelSerializer):
    vessel_name = serializers.CharField(source='vessel.name', read_only=True)
    vessel_mmsi = serializers.CharField(source='vessel.mmsi', read_only=True)

    class Meta:
        model = VesselPosition
        fields = [
            'id', 'vessel_name', 'vessel_mmsi', 'latitude', 'longitude',
            'speed_over_ground', 'course_over_ground', 'heading',
            'nav_status', 'timestamp',
        ]


class AnomalyLogSerializer(serializers.ModelSerializer):
    vessel_name = serializers.CharField(source='vessel.name', read_only=True)
    vessel_mmsi = serializers.CharField(source='vessel.mmsi', read_only=True)

    class Meta:
        model = AnomalyLog
        fields = [
            'id', 'vessel_name', 'vessel_mmsi', 'anomaly_type', 'severity',
            'description', 'latitude', 'longitude', 'detected_at',
            'resolved_at', 'is_resolved', 'metadata',
        ]


class PortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Port
        fields = ['id', 'name', 'code', 'country', 'latitude', 'longitude', 'is_inland', 'timezone']
