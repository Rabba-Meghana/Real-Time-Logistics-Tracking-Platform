from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('voyages', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Invoice',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True)),
                ('invoice_number', models.CharField(db_index=True, max_length=100, unique=True)),
                ('voyage', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='invoices', to='voyages.voyage')),
                ('vendor_name', models.CharField(max_length=200)),
                ('vendor_address', models.TextField(blank=True)),
                ('s3_key', models.CharField(blank=True, max_length=500)),
                ('filename', models.CharField(blank=True, max_length=200)),
                ('invoice_date', models.DateField(blank=True, null=True)),
                ('due_date', models.DateField(blank=True, null=True)),
                ('subtotal', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('tax_amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('total_amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('currency', models.CharField(default='USD', max_length=3)),
                ('validation_status', models.CharField(choices=[('pending','Pending'),('validating','Validating'),('valid','Valid'),('invalid','Invalid'),('needs_review','Needs Review'),('validation_error','Validation Error'),('approved','Approved'),('rejected','Rejected')], db_index=True, default='pending', max_length=20)),
                ('discrepancies', models.JSONField(default=list)),
                ('confidence_score', models.FloatField(blank=True, null=True)),
                ('validation_notes', models.TextField(blank=True)),
                ('validated_at', models.DateTimeField(blank=True, null=True)),
                ('validation_model', models.CharField(blank=True, max_length=50)),
                ('uploaded_by', models.CharField(blank=True, max_length=200)),
                ('uploaded_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('approved_by', models.CharField(blank=True, max_length=200)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('line_items', models.JSONField(default=list)),
                ('extracted_data', models.JSONField(default=dict)),
                ('retry_count', models.IntegerField(default=0)),
            ],
            options={'db_table': 'invoices', 'ordering': ['-uploaded_at']},
        ),
        migrations.AddIndex(
            model_name='invoice',
            index=models.Index(fields=['validation_status'], name='inv_status_idx'),
        ),
        migrations.AddIndex(
            model_name='invoice',
            index=models.Index(fields=['voyage', 'validation_status'], name='inv_voyage_status_idx'),
        ),
        migrations.AddIndex(
            model_name='invoice',
            index=models.Index(fields=['uploaded_at'], name='inv_uploaded_idx'),
        ),
    ]
