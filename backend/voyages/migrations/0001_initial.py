from django.db import migrations, models
import django.contrib.gis.db.models.fields
import django.db.models.deletion
import django.utils.timezone
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('vessels', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Voyage',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True)),
                ('voyage_number', models.CharField(db_index=True, max_length=20, unique=True)),
                ('barge', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='voyages', to='vessels.vessel')),
                ('origin_port', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='departures', to='vessels.port')),
                ('destination_port', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='arrivals', to='vessels.port')),
                ('status', models.CharField(choices=[('planned','Planned'),('active','Active'),('delayed','Delayed'),('completed','Completed'),('cancelled','Cancelled')], db_index=True, default='planned', max_length=20)),
                ('cargo_type', models.CharField(choices=[('grain','Grain'),('coal','Coal'),('petroleum','Petroleum'),('chemicals','Chemicals'),('containers','Containers'),('steel','Steel'),('aggregate','Aggregate'),('fertilizer','Fertilizer'),('other','Other')], default='other', max_length=20)),
                ('cargo_weight_tons', models.FloatField(default=0)),
                ('cargo_description', models.TextField(blank=True)),
                ('departure_date', models.DateTimeField()),
                ('estimated_arrival', models.DateTimeField(blank=True, null=True)),
                ('actual_arrival', models.DateTimeField(blank=True, null=True)),
                ('planned_route', django.contrib.gis.db.models.fields.LineStringField(blank=True, geography=True, null=True, srid=4326)),
                ('last_known_position', models.JSONField(blank=True, null=True)),
                ('distance_nm', models.FloatField(blank=True, null=True)),
                ('agreed_rate_per_ton', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('fuel_surcharge', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('port_fees_agreed', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('total_agreed_cost', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'db_table': 'voyages', 'ordering': ['-departure_date']},
        ),
        migrations.AddIndex(
            model_name='voyage',
            index=models.Index(fields=['status', 'departure_date'], name='voyage_status_dep_idx'),
        ),
        migrations.AddIndex(
            model_name='voyage',
            index=models.Index(fields=['barge', 'status'], name='voyage_barge_status_idx'),
        ),
        migrations.AddIndex(
            model_name='voyage',
            index=models.Index(fields=['departure_date'], name='voyage_dep_idx'),
        ),
        migrations.CreateModel(
            name='VoyageEvent',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True)),
                ('voyage', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='events', to='voyages.voyage')),
                ('event_type', models.CharField(choices=[('departed','Departed'),('arrived','Arrived'),('waypoint_reached','Waypoint Reached'),('weather_delay','Weather Delay'),('mechanical_issue','Mechanical Issue'),('lock_delay','Lock Delay'),('cargo_loaded','Cargo Loaded'),('cargo_discharged','Cargo Discharged'),('inspection','Inspection'),('route_change','Route Change')], max_length=30)),
                ('description', models.TextField()),
                ('latitude', models.FloatField(blank=True, null=True)),
                ('longitude', models.FloatField(blank=True, null=True)),
                ('occurred_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('recorded_by', models.CharField(blank=True, max_length=100)),
                ('metadata', models.JSONField(default=dict)),
            ],
            options={'db_table': 'voyage_events', 'ordering': ['-occurred_at']},
        ),
    ]
