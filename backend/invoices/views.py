from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.utils import timezone
from django.db.models import Count, Sum, Avg, Q
from datetime import timedelta

from .models import Invoice
from .serializers import InvoiceSerializer
from .tasks import validate_invoice


class InvoiceViewSet(viewsets.ModelViewSet):
    serializer_class = InvoiceSerializer
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = Invoice.objects.select_related('voyage').order_by('-uploaded_at')
        status_filter = self.request.query_params.get('validation_status')
        if status_filter:
            qs = qs.filter(validation_status=status_filter)
        return qs

    def perform_create(self, serializer):
        instance = serializer.save(validation_status='pending')
        validate_invoice.apply_async(
            args=[str(instance.id)],
            countdown=2,
            queue='invoice_validation',
        )

    @action(detail=True, methods=['post'])
    def revalidate(self, request, pk=None):
        invoice = self.get_object()
        invoice.validation_status = 'pending'
        invoice.save(update_fields=['validation_status'])
        validate_invoice.apply_async(
            args=[str(invoice.id)],
            countdown=2,
            queue='invoice_validation',
        )
        return Response({'message': 'Revalidation queued', 'invoice_id': str(invoice.id)})

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        invoice = self.get_object()
        invoice.validation_status = 'approved'
        invoice.approved_at = timezone.now()
        invoice.approved_by = request.data.get('approved_by', 'system')
        invoice.save()
        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        invoice = self.get_object()
        invoice.validation_status = 'rejected'
        invoice.save()
        return Response(InvoiceSerializer(invoice).data)


    @action(detail=True, methods=['post'])
    def summary(self, request, pk=None):
        invoice = self.get_object()
        import os
        from django.conf import settings
        groq_key = getattr(settings, 'GROQ_API_KEY', '') or os.environ.get('GROQ_API_KEY', '')
        groq_model = getattr(settings, 'GROQ_MODEL', 'llama-3.3-70b-versatile')
        if not groq_key:
            return Response({'summary': 'AI summary unavailable — GROQ_API_KEY not configured.'})
        try:
            import httpx
            prompt = (
                f'Summarize this freight invoice in 2-3 sentences for an operations manager. '
                f'Be concise and highlight any risks.

'
                f'Invoice: {invoice.invoice_number}
'
                f'Vendor: {invoice.vendor_name}
'
                f'Amount: ${float(invoice.total_amount):,.2f}
'
                f'LLM Confidence: {round((invoice.confidence_score or 0) * 100)}%
'
                f'Status: {invoice.validation_status}
'
                f'Discrepancies: {invoice.discrepancy_count}
'
                f'Notes: {invoice.validation_notes or "none"}'
            )
            res = httpx.post(
                'https://api.groq.com/openai/v1/chat/completions',
                headers={'Authorization': f'Bearer {groq_key}', 'Content-Type': 'application/json'},
                json={'model': groq_model, 'messages': [{'role': 'user', 'content': prompt}], 'max_tokens': 200},
                timeout=15,
            )
            data = res.json()
            text = data['choices'][0]['message']['content'].strip()
            return Response({'summary': text})
        except Exception as e:
            return Response({'summary': f'Summary unavailable: {str(e)}'})

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        cutoff_30d = timezone.now() - timedelta(days=30)
        total = Invoice.objects.count()
        by_status = dict(
            Invoice.objects.values('validation_status')
            .annotate(count=Count('id'))
            .values_list('validation_status', 'count')
        )
        needs_review = Invoice.objects.filter(
            validation_status__in=['needs_review', 'invalid']
        ).count()
        avg_confidence = Invoice.objects.filter(
            confidence_score__isnull=False
        ).aggregate(avg=Avg('confidence_score'))['avg'] or 0
        total_value = Invoice.objects.aggregate(total=Sum('total_amount'))['total'] or 0
        recent_validated = Invoice.objects.filter(
            validated_at__gte=cutoff_30d
        ).count()
        return Response({
            'total_invoices': total,
            'by_status': by_status,
            'needs_review': needs_review,
            'avg_confidence_score': round(float(avg_confidence), 3),
            'total_invoice_value': float(total_value),
            'validated_last_30d': recent_validated,
        })

    @action(detail=False, methods=['get'])
    def pending_review(self, request):
        invoices = Invoice.objects.filter(
            validation_status__in=['needs_review', 'invalid']
        ).select_related('voyage').order_by('-uploaded_at')[:50]
        return Response(InvoiceSerializer(invoices, many=True).data)
