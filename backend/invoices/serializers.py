from rest_framework import serializers
from .models import Invoice


class InvoiceSerializer(serializers.ModelSerializer):
    voyage_number = serializers.CharField(source='voyage.voyage_number', read_only=True)
    has_critical_discrepancy = serializers.BooleanField(read_only=True)
    discrepancy_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'voyage', 'voyage_number',
            'vendor_name', 'vendor_address', 's3_key', 'filename',
            'invoice_date', 'due_date', 'subtotal', 'tax_amount',
            'total_amount', 'currency', 'validation_status',
            'discrepancies', 'confidence_score', 'validation_notes',
            'validated_at', 'validation_model', 'uploaded_by', 'uploaded_at',
            'approved_by', 'approved_at', 'line_items', 'extracted_data',
            'has_critical_discrepancy', 'discrepancy_count', 'retry_count',
        ]
        read_only_fields = [
            'validation_status', 'discrepancies', 'confidence_score',
            'validation_notes', 'validated_at', 'validation_model',
            'extracted_data', 'retry_count',
        ]
