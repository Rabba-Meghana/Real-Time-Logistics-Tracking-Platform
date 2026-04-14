from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from django.db.models import Count, Avg, Max
from django.utils import timezone
from datetime import timedelta
from django_filters.rest_framework import DjangoFilterBackend

from .models import Vessel, VesselPosition, AnomalyLog, Port
from .serializers import (
    VesselSerializer, VesselPositionSerializer,
    VesselPositionHistorySerializer, AnomalyLogSerializer, PortSerializer
)


class VesselViewSet(viewsets.ModelViewSet):
    queryset = Vessel.objects.filter(is_active=True)
    serializer_class = VesselSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['vessel_type', 'flag', 'is_active']
    search_fields = ['name', 'mmsi', 'callsign']

    @action(detail=False, methods=['get'])
    def live_positions(self, request):
        limit = int(request.query_params.get('limit', 300))
        cutoff = timezone.now() - timedelta(hours=4)
        # Direct query: get recent positions joined with vessel
        positions = VesselPosition.objects.filter(
            timestamp__gte=cutoff
        ).select_related('vessel').order_by('-timestamp')[:limit]

        seen = set()
        data = []
        for pos in positions:
            if pos.vessel_id in seen:
                continue
            seen.add(pos.vessel_id)
            v = pos.vessel
            data.append({
                'vessel_id': str(v.id),
                'mmsi': v.mmsi,
                'name': v.name,
                'vessel_type': v.vessel_type,
                'lat': float(pos.latitude),
                'lon': float(pos.longitude),
                'speed': float(pos.speed_over_ground or 0),
                'course': float(pos.course_over_ground or 0),
                'heading': pos.heading or 511,
                'nav_status': pos.nav_status or 15,
                'timestamp': pos.timestamp.isoformat(),
            })
        return Response(data)

    @action(detail=True, methods=['get'])
    def track(self, request, pk=None):
        vessel = self.get_object()
        hours = int(request.query_params.get('hours', 24))
        cutoff = timezone.now() - timedelta(hours=hours)
        positions = vessel.positions.filter(
            timestamp__gte=cutoff
        ).order_by('timestamp')[:2000]
        serializer = VesselPositionSerializer(positions, many=True)
        return Response({
            'vessel': VesselSerializer(vessel).data,
            'track': serializer.data,
            'point_count': len(serializer.data),
        })

    @action(detail=False, methods=['get'])
    def nearby(self, request):
        lat = float(request.query_params.get('lat', 0))
        lon = float(request.query_params.get('lon', 0))
        radius_km = float(request.query_params.get('radius_km', 50))
        ref_point = Point(lon, lat, srid=4326)
        recent_cutoff = timezone.now() - timedelta(hours=4)
        recent_positions = VesselPosition.objects.filter(
            timestamp__gte=recent_cutoff,
            position__distance_lte=(ref_point, D(km=radius_km))
        ).select_related('vessel').order_by('vessel_id', '-timestamp')
        seen = set()
        results = []
        for pos in recent_positions:
            if pos.vessel_id not in seen:
                seen.add(pos.vessel_id)
                results.append({
                    'vessel': VesselSerializer(pos.vessel).data,
                    'position': VesselPositionSerializer(pos).data,
                })
        return Response(results)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        total = Vessel.objects.filter(is_active=True).count()
        by_type = dict(
            Vessel.objects.filter(is_active=True)
            .values('vessel_type')
            .annotate(count=Count('id'))
            .values_list('vessel_type', 'count')
        )
        cutoff_1h = timezone.now() - timedelta(hours=1)
        active_1h = VesselPosition.objects.filter(
            timestamp__gte=cutoff_1h
        ).values('vessel').distinct().count()
        return Response({
            'total_vessels': total,
            'active_last_hour': active_1h,
            'by_type': by_type,
        })


class AnomalyLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AnomalyLog.objects.select_related('vessel')
    serializer_class = AnomalyLogSerializer
    permission_classes = [AllowAny]
    filterset_fields = ['anomaly_type', 'severity', 'is_resolved']

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        anomaly = self.get_object()
        anomaly.is_resolved = True
        anomaly.resolved_at = timezone.now()
        anomaly.save()
        return Response(AnomalyLogSerializer(anomaly).data)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        cutoff_24h = timezone.now() - timedelta(hours=24)
        by_type = dict(
            AnomalyLog.objects.filter(detected_at__gte=cutoff_24h)
            .values('anomaly_type')
            .annotate(count=Count('id'))
            .values_list('anomaly_type', 'count')
        )
        unresolved = AnomalyLog.objects.filter(is_resolved=False).count()
        critical = AnomalyLog.objects.filter(
            is_resolved=False, severity='critical'
        ).count()
        return Response({
            'last_24h_by_type': by_type,
            'unresolved_total': unresolved,
            'critical_unresolved': critical,
        })


class PortViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Port.objects.all()
    serializer_class = PortSerializer
    permission_classes = [AllowAny]
