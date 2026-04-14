from rest_framework import serializers
from .models import Voyage, VoyageEvent


class VoyageEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoyageEvent
        fields = [
            'id', 'event_type', 'description', 'latitude', 'longitude',
            'occurred_at', 'recorded_by', 'metadata',
        ]


class VoyageSerializer(serializers.ModelSerializer):
    origin_port_name = serializers.CharField(source='origin_port.name', read_only=True)
    origin_port_code = serializers.CharField(source='origin_port.code', read_only=True)
    destination_port_name = serializers.CharField(source='destination_port.name', read_only=True)
    destination_port_code = serializers.CharField(source='destination_port.code', read_only=True)
    barge_name = serializers.CharField(source='barge.name', read_only=True)
    barge_mmsi = serializers.CharField(source='barge.mmsi', read_only=True)
    duration_days = serializers.SerializerMethodField()
    is_delayed = serializers.BooleanField(read_only=True)
    events = VoyageEventSerializer(many=True, read_only=True)

    class Meta:
        model = Voyage
        fields = [
            'id', 'voyage_number', 'barge', 'barge_name', 'barge_mmsi',
            'origin_port', 'origin_port_name', 'origin_port_code',
            'destination_port', 'destination_port_name', 'destination_port_code',
            'status', 'cargo_type', 'cargo_weight_tons', 'cargo_description',
            'departure_date', 'estimated_arrival', 'actual_arrival',
            'last_known_position', 'distance_nm',
            'agreed_rate_per_ton', 'fuel_surcharge', 'port_fees_agreed', 'total_agreed_cost',
            'notes', 'duration_days', 'is_delayed', 'events',
            'created_at', 'updated_at',
        ]

    def get_duration_days(self, obj):
        return round(obj.duration_days, 2) if obj.duration_days else None


class VoyageListSerializer(serializers.ModelSerializer):
    origin_port_name = serializers.CharField(source='origin_port.name', read_only=True)
    origin_port_code = serializers.CharField(source='origin_port.code', read_only=True)
    destination_port_name = serializers.CharField(source='destination_port.name', read_only=True)
    destination_port_code = serializers.CharField(source='destination_port.code', read_only=True)
    barge_name = serializers.CharField(source='barge.name', read_only=True)
    is_delayed = serializers.BooleanField(read_only=True)

    class Meta:
        model = Voyage
        fields = [
            'id', 'voyage_number', 'barge_name', 'barge_mmsi',
            'origin_port_name', 'origin_port_code',
            'destination_port_name', 'destination_port_code',
            'status', 'cargo_type', 'cargo_weight_tons',
            'departure_date', 'estimated_arrival', 'actual_arrival',
            'distance_nm', 'agreed_rate_per_ton', 'total_agreed_cost', 'is_delayed',
        ]

        read_only_fields = ['barge_mmsi']

    barge_mmsi = serializers.CharField(source='barge.mmsi', read_only=True)
