from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.utils import timezone
from datetime import timedelta


@api_view(['GET'])
@permission_classes([AllowAny])
def metrics_summary(request):
    from vessels.models import Vessel, VesselPosition, AnomalyLog
    from voyages.models import Voyage
    from invoices.models import Invoice

    now = timezone.now()
    cutoff_1h = now - timedelta(hours=1)
    cutoff_24h = now - timedelta(hours=24)

    return Response({
        'timestamp': now.isoformat(),
        'vessels': {
            'total_active': Vessel.objects.filter(is_active=True).count(),
            'reporting_last_hour': VesselPosition.objects.filter(
                timestamp__gte=cutoff_1h
            ).values('vessel').distinct().count(),
            'positions_ingested_24h': VesselPosition.objects.filter(
                timestamp__gte=cutoff_24h
            ).count(),
        },
        'voyages': {
            'active': Voyage.objects.filter(status='active').count(),
            'delayed': Voyage.objects.filter(status='delayed').count(),
            'completed_today': Voyage.objects.filter(
                status='completed',
                actual_arrival__gte=now.replace(hour=0, minute=0, second=0),
            ).count(),
        },
        'invoices': {
            'pending_validation': Invoice.objects.filter(status='pending').count()
            if hasattr(Invoice, 'status') else
            Invoice.objects.filter(validation_status='pending').count(),
            'needs_review': Invoice.objects.filter(
                validation_status__in=['needs_review', 'invalid']
            ).count(),
            'validated_today': Invoice.objects.filter(
                validated_at__gte=now.replace(hour=0, minute=0, second=0),
            ).count(),
        },
        'anomalies': {
            'unresolved': AnomalyLog.objects.filter(is_resolved=False).count(),
            'critical': AnomalyLog.objects.filter(
                is_resolved=False, severity='critical'
            ).count(),
            'detected_24h': AnomalyLog.objects.filter(
                detected_at__gte=cutoff_24h
            ).count(),
        },
    })
