from django.db import models
from django.utils import timezone
import uuid


class Invoice(models.Model):
    VALIDATION_STATUS = [
        ('pending', 'Pending'),
        ('validating', 'Validating'),
        ('valid', 'Valid'),
        ('invalid', 'Invalid'),
        ('needs_review', 'Needs Review'),
        ('validation_error', 'Validation Error'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_number = models.CharField(max_length=100, unique=True, db_index=True)
    voyage = models.ForeignKey('voyages.Voyage', on_delete=models.PROTECT, related_name='invoices')
    vendor_name = models.CharField(max_length=200)
    vendor_address = models.TextField(blank=True)
    s3_key = models.CharField(max_length=500, blank=True)
    filename = models.CharField(max_length=200, blank=True)
    invoice_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default='USD')
    validation_status = models.CharField(
        max_length=20, choices=VALIDATION_STATUS, default='pending', db_index=True
    )
    discrepancies = models.JSONField(default=list)
    confidence_score = models.FloatField(null=True, blank=True)
    validation_notes = models.TextField(blank=True)
    validated_at = models.DateTimeField(null=True, blank=True)
    validation_model = models.CharField(max_length=50, blank=True)
    uploaded_by = models.CharField(max_length=200, blank=True)
    uploaded_at = models.DateTimeField(default=timezone.now)
    approved_by = models.CharField(max_length=200, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    line_items = models.JSONField(default=list)
    extracted_data = models.JSONField(default=dict)
    retry_count = models.IntegerField(default=0)

    class Meta:
        db_table = 'invoices'
        indexes = [
            models.Index(fields=['validation_status']),
            models.Index(fields=['voyage', 'validation_status']),
            models.Index(fields=['uploaded_at']),
        ]
        ordering = ['-uploaded_at']

    def __str__(self):
        return f'{self.invoice_number} - {self.vendor_name}'

    @property
    def has_critical_discrepancy(self):
        return any(d.get('severity') == 'critical' for d in self.discrepancies)

    @property
    def discrepancy_count(self):
        return len(self.discrepancies)
