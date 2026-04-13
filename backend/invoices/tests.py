import pytest
from decimal import Decimal
from django.utils import timezone
from unittest.mock import patch


@pytest.mark.django_db
class TestInvoiceModel:
    def _make_voyage(self):
        from vessels.models import Vessel, Port
        from voyages.models import Voyage
        from django.contrib.gis.geos import Point
        origin = Port.objects.create(
            name='Paducah', code='USPAH', country='US',
            latitude=37.08, longitude=-88.60,
            position=Point(-88.60, 37.08, srid=4326), is_inland=True,
        )
        dest = Port.objects.create(
            name='Nashville', code='USBNA', country='US',
            latitude=36.16, longitude=-86.78,
            position=Point(-86.78, 36.16, srid=4326), is_inland=True,
        )
        vessel = Vessel.objects.create(mmsi='338700001', name='Tennessee Belle', vessel_type='barge')
        return Voyage.objects.create(
            barge=vessel, origin_port=origin, destination_port=dest,
            status='completed', cargo_type='fertilizer', cargo_weight_tons=8000,
            departure_date=timezone.now() - timezone.timedelta(days=5),
            actual_arrival=timezone.now() - timezone.timedelta(days=2),
            agreed_rate_per_ton=Decimal('5.00'),
            fuel_surcharge=Decimal('1200.00'),
            port_fees_agreed=Decimal('900.00'),
            total_agreed_cost=Decimal('42100.00'),
        )

    def test_invoice_creation(self):
        from invoices.models import Invoice
        voyage = self._make_voyage()
        inv = Invoice.objects.create(
            invoice_number='INV-TEST001',
            voyage=voyage,
            vendor_name='Southern Rivers Corp',
            total_amount=Decimal('42100.00'),
            validation_status='pending',
        )
        assert inv.invoice_number == 'INV-TEST001'
        assert inv.validation_status == 'pending'
        assert inv.has_critical_discrepancy is False
        assert inv.discrepancy_count == 0

    def test_invoice_with_critical_discrepancy(self):
        from invoices.models import Invoice
        voyage = self._make_voyage()
        inv = Invoice.objects.create(
            invoice_number='INV-TEST002',
            voyage=voyage,
            vendor_name='Midwest Barge Lines',
            total_amount=Decimal('55000.00'),
            validation_status='invalid',
            discrepancies=[{
                'field': 'total_amount',
                'invoice_value': '55000.00',
                'voyage_value': '42100.00',
                'severity': 'critical',
                'description': 'Amount exceeds agreed cost by 30.6%',
            }],
            confidence_score=0.92,
        )
        assert inv.has_critical_discrepancy is True
        assert inv.discrepancy_count == 1


class TestInvoiceValidation:
    def test_rule_based_fallback_valid(self):
        from invoices.tasks import _rule_based_fallback
        invoice_data = {'total_amount': 42100.00, 'voyage_reference': 'VYG-2024-12345'}
        voyage_data = {'total_agreed_cost': 42100.00, 'voyage_number': 'VYG-2024-12345'}
        result = _rule_based_fallback(invoice_data, voyage_data)
        assert result['is_valid'] is True
        assert len(result['discrepancies']) == 0
        assert result['confidence'] > 0

    def test_rule_based_flags_large_discrepancy(self):
        from invoices.tasks import _rule_based_fallback
        invoice_data = {'total_amount': 60000.00, 'voyage_reference': 'VYG-2024-12345'}
        voyage_data = {'total_agreed_cost': 42100.00, 'voyage_number': 'VYG-2024-12345'}
        result = _rule_based_fallback(invoice_data, voyage_data)
        assert result['is_valid'] is False
        assert len(result['discrepancies']) > 0
        assert result['discrepancies'][0]['severity'] == 'critical'

    def test_rule_based_flags_voyage_mismatch(self):
        from invoices.tasks import _rule_based_fallback
        invoice_data = {'total_amount': 42100.00, 'voyage_reference': 'VYG-2024-99999'}
        voyage_data = {'total_agreed_cost': 42100.00, 'voyage_number': 'VYG-2024-12345'}
        result = _rule_based_fallback(invoice_data, voyage_data)
        assert result['is_valid'] is False
        assert any(d['field'] == 'voyage_reference' for d in result['discrepancies'])

    def test_groq_fallback_when_no_key(self):
        from invoices.tasks import _call_groq_validation
        invoice_data = {'total_amount': 42100.00}
        voyage_data = {'total_agreed_cost': 42100.00, 'voyage_number': 'VYG-2024-12345'}
        with patch('django.conf.settings.GROQ_API_KEY', ''):
            result = _call_groq_validation(invoice_data, voyage_data)
        assert 'is_valid' in result
        assert 'confidence' in result
        assert 'discrepancies' in result

    def test_pdf_extraction_handles_missing_file(self):
        from invoices.tasks import _extract_pdf_text
        result = _extract_pdf_text('/nonexistent/path/invoice.pdf')
        assert 'error' in result or 'raw_text' in result


@pytest.mark.django_db
class TestInvoiceViews:
    def test_invoice_list(self, client):
        response = client.get('/api/invoices/')
        assert response.status_code == 200

    def test_invoice_dashboard_stats(self, client):
        response = client.get('/api/invoices/dashboard_stats/')
        assert response.status_code == 200
        data = response.json()
        assert 'total_invoices' in data
        assert 'needs_review' in data
        assert 'avg_confidence_score' in data

    def test_pending_review(self, client):
        response = client.get('/api/invoices/pending_review/')
        assert response.status_code == 200
