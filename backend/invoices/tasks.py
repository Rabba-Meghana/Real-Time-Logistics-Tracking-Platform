import json
import logging
import re
import os
from typing import Dict
from celery import shared_task
from django.utils import timezone
from django.conf import settings

logger = logging.getLogger(__name__)


def _extract_pdf_text(file_path: str) -> Dict:
    try:
        import pdfplumber
        text = ''
        tables = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ''
                text += page_text + '\n'
                page_tables = page.extract_tables()
                if page_tables:
                    tables.extend(page_tables)

        structured: Dict = {'raw_text': text, 'tables': tables}

        for pattern in [
            r'Invoice\s*#?\s*:?\s*([A-Z0-9\-]+)',
            r'INV[-\s]?(\d+)',
            r'Invoice Number\s*:?\s*([A-Z0-9\-]+)',
        ]:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                structured['invoice_number'] = m.group(1)
                break

        dates = re.findall(r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\w+ \d{1,2},? \d{4})', text)
        if dates:
            structured['invoice_date'] = dates[0]
            if len(dates) > 1:
                structured['due_date'] = dates[1]

        for pattern in [
            r'Total\s*:?\s*\$?([\d,]+\.?\d{0,2})',
            r'Amount Due\s*:?\s*\$?([\d,]+\.?\d{0,2})',
            r'Grand Total\s*:?\s*\$?([\d,]+\.?\d{0,2})',
        ]:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                try:
                    structured['total_amount'] = float(m.group(1).replace(',', ''))
                    break
                except ValueError:
                    pass

        for pattern in [
            r'Voyage\s*#?\s*:?\s*(VYG[-\d]+)',
            r'Reference\s*:?\s*(VYG[-\d]+)',
        ]:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                structured['voyage_reference'] = m.group(1)
                break

        return structured

    except Exception as e:
        logger.error(f'PDF extraction error: {e}')
        return {'raw_text': '', 'error': str(e)}


def _rule_based_fallback(invoice_data: Dict, voyage_data: Dict) -> Dict:
    discrepancies = []
    invoice_total = float(invoice_data.get('total_amount') or 0)
    voyage_total = float(voyage_data.get('total_agreed_cost') or 0)

    if invoice_total and voyage_total:
        diff_pct = abs(invoice_total - voyage_total) / max(voyage_total, 1) * 100
        if diff_pct > 10:
            discrepancies.append({
                'field': 'total_amount',
                'invoice_value': str(round(invoice_total, 2)),
                'voyage_value': str(round(voyage_total, 2)),
                'severity': 'critical' if diff_pct > 25 else 'major',
                'description': f'Total differs by {diff_pct:.1f}% from agreed voyage cost',
            })

    voyage_ref = invoice_data.get('voyage_reference', '')
    if voyage_ref and voyage_ref != voyage_data.get('voyage_number', ''):
        discrepancies.append({
            'field': 'voyage_reference',
            'invoice_value': voyage_ref,
            'voyage_value': voyage_data.get('voyage_number', ''),
            'severity': 'major',
            'description': 'Voyage reference does not match system record',
        })

    return {
        'is_valid': len(discrepancies) == 0,
        'discrepancies': discrepancies,
        'confidence': 0.60,
        'validation_notes': 'Rule-based validation — set GROQ_API_KEY for LLM-powered validation',
        'extracted_invoice_number': invoice_data.get('invoice_number'),
        'extracted_total': invoice_total,
    }


def _call_groq_validation(invoice_data: Dict, voyage_data: Dict) -> Dict:
    """
    Call Groq API for LLM-powered invoice validation.
    All config from environment — GROQ_API_KEY and GROQ_MODEL.
    """
    system_prompt = (
        "You are an invoice validation AI for a marine freight logistics company "
        "specializing in inland waterway barge transport. "
        "Compare the invoice against the voyage record and identify discrepancies. "
        "Return ONLY valid JSON — no markdown, no preamble:\n"
        '{"is_valid": bool, "discrepancies": [{"field": "str", "invoice_value": "str", '
        '"voyage_value": "str", "severity": "minor|major|critical", "description": "str"}], '
        '"confidence": 0.0, "validation_notes": "str", '
        '"extracted_invoice_number": "str|null", "extracted_total": 0.0}'
    )

    user_prompt = (
        f"Invoice data:\n{json.dumps(invoice_data, indent=2, default=str)}\n\n"
        f"Voyage record:\n{json.dumps(voyage_data, indent=2, default=str)}"
    )

    groq_api_key = getattr(settings, 'GROQ_API_KEY', '') or os.environ.get('GROQ_API_KEY', '')
    groq_model = (
        getattr(settings, 'GROQ_MODEL', '')
        or os.environ.get('GROQ_MODEL', 'llama-3.3-70b-versatile')
    )

    if not groq_api_key:
        logger.warning('GROQ_API_KEY not configured — using rule-based fallback')
        return _rule_based_fallback(invoice_data, voyage_data)

    try:
        from groq import Groq
        client = Groq(api_key=groq_api_key)
        completion = client.chat.completions.create(
            model=groq_model,
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ],
            temperature=0.1,
            max_tokens=1024,
        )
        response_text = completion.choices[0].message.content or ''
        logger.info(f'Groq validation completed: model={groq_model}')
    except Exception as e:
        logger.error(f'Groq API error: {e}')
        return _rule_based_fallback(invoice_data, voyage_data)

    try:
        clean = response_text.strip()
        clean = re.sub(r'^```(?:json)?\s*', '', clean, flags=re.MULTILINE)
        clean = re.sub(r'\s*```$', '', clean, flags=re.MULTILINE)
        return json.loads(clean.strip())
    except json.JSONDecodeError as e:
        logger.error(f'Groq response parse error: {e}')
        return _rule_based_fallback(invoice_data, voyage_data)


@shared_task(bind=True, max_retries=3)
def validate_invoice(self, invoice_id: str):
    from .models import Invoice
    import tempfile

    try:
        invoice = Invoice.objects.select_related(
            'voyage__barge',
            'voyage__origin_port',
            'voyage__destination_port',
        ).get(id=invoice_id)

        invoice.validation_status = 'validating'
        invoice.save(update_fields=['validation_status'])

        pdf_path = None
        if invoice.s3_key:
            try:
                import boto3
                s3 = boto3.client(
                    's3',
                    aws_access_key_id=getattr(settings, 'AWS_ACCESS_KEY_ID', ''),
                    aws_secret_access_key=getattr(settings, 'AWS_SECRET_ACCESS_KEY', ''),
                    region_name=getattr(settings, 'AWS_S3_REGION_NAME', 'us-east-1'),
                )
                tmp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
                s3.download_fileobj(
                    getattr(settings, 'AWS_STORAGE_BUCKET_NAME', ''),
                    invoice.s3_key,
                    tmp,
                )
                tmp.close()
                pdf_path = tmp.name
            except Exception as e:
                logger.warning(f'S3 download failed for {invoice_id}: {e}')

        extracted = _extract_pdf_text(pdf_path) if pdf_path else {
            'invoice_number': invoice.invoice_number,
            'vendor_name': invoice.vendor_name,
            'total_amount': float(invoice.total_amount),
            'voyage_reference': invoice.voyage.voyage_number,
            'invoice_date': str(invoice.invoice_date) if invoice.invoice_date else None,
        }

        voyage = invoice.voyage
        voyage_data = {
            'voyage_number': voyage.voyage_number,
            'origin': voyage.origin_port.name,
            'destination': voyage.destination_port.name,
            'departure_date': voyage.departure_date.isoformat(),
            'cargo_type': voyage.cargo_type,
            'cargo_weight_tons': voyage.cargo_weight_tons,
            'agreed_rate_per_ton': float(voyage.agreed_rate_per_ton),
            'fuel_surcharge': float(voyage.fuel_surcharge),
            'port_fees_agreed': float(voyage.port_fees_agreed),
            'total_agreed_cost': float(voyage.total_agreed_cost),
        }

        result = _call_groq_validation(extracted, voyage_data)

        confidence = float(result.get('confidence', 0.5))
        discrepancies = result.get('discrepancies', [])
        has_critical = any(d.get('severity') == 'critical' for d in discrepancies)

        if confidence < 0.70:
            new_status = 'needs_review'
        elif not result.get('is_valid', True) and has_critical:
            new_status = 'invalid'
        elif not result.get('is_valid', True):
            new_status = 'needs_review'
        else:
            new_status = 'valid'

        groq_model = (
            getattr(settings, 'GROQ_MODEL', '')
            or os.environ.get('GROQ_MODEL', 'llama-3.3-70b-versatile')
        )
        has_groq = bool(getattr(settings, 'GROQ_API_KEY', '') or os.environ.get('GROQ_API_KEY', ''))

        invoice.validation_status = new_status
        invoice.discrepancies = discrepancies
        invoice.confidence_score = confidence
        invoice.validation_notes = result.get('validation_notes', '')
        invoice.extracted_data = extracted
        invoice.validated_at = timezone.now()
        invoice.validation_model = groq_model if has_groq else 'rule-based'
        invoice.retry_count = self.request.retries

        extracted_total = result.get('extracted_total')
        if extracted_total and float(extracted_total) > 0:
            from decimal import Decimal
            invoice.total_amount = Decimal(str(round(float(extracted_total), 2)))

        invoice.save()

        logger.info(
            f'Invoice {invoice_id}: {new_status} '
            f'(confidence={confidence:.2f}, discrepancies={len(discrepancies)})'
        )
        return {
            'invoice_id': invoice_id,
            'status': new_status,
            'confidence': confidence,
            'discrepancy_count': len(discrepancies),
        }

    except Exception as exc:
        logger.error(f'Invoice validation error {invoice_id}: {exc}')
        try:
            from .models import Invoice as Inv
            Inv.objects.filter(id=invoice_id).update(
                validation_status='validation_error',
                retry_count=self.request.retries,
            )
        except Exception:
            pass
        raise self.retry(
            exc=exc,
            countdown=60 * (2 ** self.request.retries),
            max_retries=3,
        )
