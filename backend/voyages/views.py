from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db.models import Count, Sum, Avg, Q
from django.utils import timezone
from datetime import timedelta
from django_filters.rest_framework import DjangoFilterBackend

from .models import Voyage, VoyageEvent
from .serializers import VoyageSerializer, VoyageListSerializer, VoyageEventSerializer


class VoyageViewSet(viewsets.ModelViewSet):
    queryset = Voyage.objects.select_related(
        'barge', 'origin_port', 'destination_port'
    ).prefetch_related('events')
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'cargo_type', 'barge']

    def get_serializer_class(self):
        if self.action == 'list':
            return VoyageListSerializer
        return VoyageSerializer

    @action(detail=False, methods=['get'])
    def active(self, request):
        voyages = self.get_queryset().filter(status__in=['active', 'delayed'])
        serializer = VoyageListSerializer(voyages, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        now = timezone.now()
        cutoff_30d = now - timedelta(days=30)
        total = Voyage.objects.count()
        active = Voyage.objects.filter(status='active').count()
        delayed = Voyage.objects.filter(status='delayed').count()
        completed_30d = Voyage.objects.filter(
            status='completed', actual_arrival__gte=cutoff_30d
        ).count()
        total_cargo = Voyage.objects.filter(
            status__in=['active', 'completed']
        ).aggregate(total=Sum('cargo_weight_tons'))['total'] or 0
        total_revenue = Voyage.objects.filter(
            status='completed', actual_arrival__gte=cutoff_30d
        ).aggregate(total=Sum('total_agreed_cost'))['total'] or 0
        on_time = Voyage.objects.filter(
            status='completed',
            actual_arrival__gte=cutoff_30d,
            actual_arrival__lte=models_estimated_arrival_subquery(),
        ).count() if False else completed_30d
        avg_distance = Voyage.objects.filter(
            distance_nm__isnull=False
        ).aggregate(avg=Avg('distance_nm'))['avg'] or 0
        by_status = dict(
            Voyage.objects.values('status').annotate(count=Count('id')).values_list('status', 'count')
        )
        by_cargo = dict(
            Voyage.objects.values('cargo_type').annotate(count=Count('id')).values_list('cargo_type', 'count')
        )
        monthly_completed = []
        for i in range(6):
            month_start = (now - timedelta(days=30 * (5 - i))).replace(day=1, hour=0, minute=0, second=0)
            month_end = (month_start + timedelta(days=32)).replace(day=1)
            count = Voyage.objects.filter(
                status='completed',
                actual_arrival__gte=month_start,
                actual_arrival__lt=month_end,
            ).count()
            monthly_completed.append({
                'month': month_start.strftime('%b %Y'),
                'count': count,
            })
        return Response({
            'total_voyages': total,
            'active_voyages': active,
            'delayed_voyages': delayed,
            'completed_last_30d': completed_30d,
            'total_cargo_tons': round(total_cargo, 2),
            'revenue_last_30d': float(total_revenue),
            'avg_distance_nm': round(avg_distance, 1),
            'by_status': by_status,
            'by_cargo_type': by_cargo,
            'monthly_completed': monthly_completed,
        })

    @action(detail=True, methods=['post'])
    def add_event(self, request, pk=None):
        voyage = self.get_object()
        serializer = VoyageEventSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(voyage=voyage)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


def models_estimated_arrival_subquery():
    pass


class VoyageEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = VoyageEvent.objects.select_related('voyage')
    serializer_class = VoyageEventSerializer
    permission_classes = [AllowAny]
    filterset_fields = ['event_type', 'voyage']
