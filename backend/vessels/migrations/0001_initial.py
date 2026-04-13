from django.db import migrations, models
import django.contrib.gis.db.models.fields
import django.utils.timezone
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Port',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True)),
                ('name', models.CharField(max_length=200)),
                ('code', models.CharField(max_length=10, unique=True)),
                ('country', models.CharField(max_length=100)),
                ('position', django.contrib.gis.db.models.fields.PointField(geography=True, srid=4326)),
                ('latitude', models.FloatField()),
                ('longitude', models.FloatField()),
                ('is_inland', models.BooleanField(default=False)),
                ('timezone', models.CharField(default='UTC', max_length=50)),
            ],
            options={'db_table': 'ports'},
        ),
        migrations.AddIndex(
            model_name='port',
            index=models.Index(fields=['code'], name='ports_code_idx'),
        ),
        migrations.CreateModel(
            name='Vessel',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True)),
                ('mmsi', models.CharField(db_index=True, max_length=9, unique=True)),
                ('imo', models.CharField(blank=True, max_length=10)),
                ('name', models.CharField(max_length=200)),
                ('callsign', models.CharField(blank=True, max_length=20)),
                ('vessel_type', models.CharField(choices=[('cargo','Cargo'),('tanker','Tanker'),('barge','Barge'),('tug','Tug'),('passenger','Passenger'),('fishing','Fishing'),('other','Other')], default='cargo', max_length=20)),
                ('flag', models.CharField(blank=True, max_length=3)),
                ('length', models.FloatField(blank=True, null=True)),
                ('width', models.FloatField(blank=True, null=True)),
                ('draft', models.FloatField(blank=True, null=True)),
                ('gross_tonnage', models.IntegerField(blank=True, null=True)),
                ('nav_status', models.IntegerField(default=15)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'db_table': 'vessels'},
        ),
        migrations.AddIndex(
            model_name='vessel',
            index=models.Index(fields=['mmsi'], name='vessels_mmsi_idx'),
        ),
        migrations.AddIndex(
            model_name='vessel',
            index=models.Index(fields=['vessel_type'], name='vessels_type_idx'),
        ),
        migrations.AddIndex(
            model_name='vessel',
            index=models.Index(fields=['is_active'], name='vessels_active_idx'),
        ),
        migrations.CreateModel(
            name='VesselPosition',
            fields=[
                ('id', models.BigAutoField(primary_key=True)),
                ('vessel', models.ForeignKey(db_index=True, on_delete=django.db.models.deletion.CASCADE, related_name='positions', to='vessels.vessel')),
                ('position', django.contrib.gis.db.models.fields.PointField(geography=True, srid=4326)),
                ('latitude', models.FloatField()),
                ('longitude', models.FloatField()),
                ('speed_over_ground', models.FloatField(default=0)),
                ('course_over_ground', models.FloatField(default=0)),
                ('heading', models.IntegerField(default=511)),
                ('nav_status', models.IntegerField(default=15)),
                ('timestamp', models.DateTimeField(db_index=True)),
                ('source', models.CharField(default='ais_feed', max_length=50)),
                ('raw_message', models.JSONField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'db_table': 'vessel_positions', 'ordering': ['-timestamp']},
        ),
        migrations.AddConstraint(
            model_name='vesselposition',
            constraint=models.UniqueConstraint(fields=['vessel', 'timestamp'], name='unique_vessel_timestamp'),
        ),
        migrations.AddIndex(
            model_name='vesselposition',
            index=models.Index(fields=['vessel', 'timestamp'], name='pos_vessel_ts_idx'),
        ),
        migrations.AddIndex(
            model_name='vesselposition',
            index=models.Index(fields=['timestamp'], name='pos_ts_idx'),
        ),
        migrations.CreateModel(
            name='AnomalyLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True)),
                ('vessel', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='anomalies', to='vessels.vessel')),
                ('anomaly_type', models.CharField(choices=[('speed_spike','Speed Spike'),('position_jump','Position Jump'),('unexpected_stop','Unexpected Stop'),('geofence_breach','Geofence Breach'),('route_deviation','Route Deviation')], max_length=30)),
                ('severity', models.CharField(choices=[('low','Low'),('medium','Medium'),('high','High'),('critical','Critical')], default='medium', max_length=10)),
                ('description', models.TextField()),
                ('position', django.contrib.gis.db.models.fields.PointField(blank=True, geography=True, null=True, srid=4326)),
                ('latitude', models.FloatField(blank=True, null=True)),
                ('longitude', models.FloatField(blank=True, null=True)),
                ('detected_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('resolved_at', models.DateTimeField(blank=True, null=True)),
                ('is_resolved', models.BooleanField(default=False)),
                ('metadata', models.JSONField(default=dict)),
            ],
            options={'db_table': 'anomaly_logs', 'ordering': ['-detected_at']},
        ),
        migrations.AddIndex(
            model_name='anomalylog',
            index=models.Index(fields=['vessel', 'detected_at'], name='anomaly_vessel_ts_idx'),
        ),
        migrations.AddIndex(
            model_name='anomalylog',
            index=models.Index(fields=['anomaly_type', 'severity'], name='anomaly_type_sev_idx'),
        ),
        migrations.AddIndex(
            model_name='anomalylog',
            index=models.Index(fields=['is_resolved'], name='anomaly_resolved_idx'),
        ),
        migrations.CreateModel(
            name='DeadLetterLog',
            fields=[
                ('id', models.BigAutoField(primary_key=True)),
                ('raw_data', models.JSONField()),
                ('failure_reason', models.CharField(max_length=200)),
                ('source', models.CharField(max_length=50)),
                ('received_at', models.DateTimeField(auto_now_add=True)),
                ('retry_count', models.IntegerField(default=0)),
            ],
            options={'db_table': 'dead_letter_logs', 'ordering': ['-received_at']},
        ),
    ]
