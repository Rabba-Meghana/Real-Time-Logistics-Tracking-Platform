import pytest
import math
from unittest.mock import patch, MagicMock
from django.utils import timezone
from datetime import timedelta


@pytest.mark.django_db
class TestVesselModel:
    def test_vessel_creation(self):
        from vessels.models import Vessel
        v = Vessel.objects.create(
            mmsi='338123456',
            name='Test Barge',
            vessel_type='barge',
            flag='US',
            is_active=True,
        )
        assert v.mmsi == '338123456'
        assert v.name == 'Test Barge'
        assert v.is_active is True
        assert str(v) == 'Test Barge (338123456)'

    def test_vessel_position_creation(self):
        from vessels.models import Vessel, VesselPosition
        from django.contrib.gis.geos import Point
        v = Vessel.objects.create(mmsi='338000001', name='River Queen', vessel_type='barge')
        pos = VesselPosition.objects.create(
            vessel=v,
            position=Point(-90.0, 38.5, srid=4326),
            latitude=38.5,
            longitude=-90.0,
            speed_over_ground=8.5,
            course_over_ground=180.0,
            heading=180,
            nav_status=0,
            timestamp=timezone.now(),
        )
        assert pos.latitude == 38.5
        assert pos.longitude == -90.0
        assert pos.speed_over_ground == 8.5

    def test_port_creation(self):
        from vessels.models import Port
        from django.contrib.gis.geos import Point
        port = Port.objects.create(
            name='New Orleans',
            code='USNOL',
            country='US',
            latitude=29.9511,
            longitude=-90.0715,
            position=Point(-90.0715, 29.9511, srid=4326),
            is_inland=True,
        )
        assert port.code == 'USNOL'
        assert port.is_inland is True

    def test_anomaly_log_creation(self):
        from vessels.models import Vessel, AnomalyLog
        from django.contrib.gis.geos import Point
        v = Vessel.objects.create(mmsi='338000002', name='Delta Mist', vessel_type='cargo')
        anomaly = AnomalyLog.objects.create(
            vessel=v,
            anomaly_type='speed_spike',
            severity='high',
            description='Speed jumped from 5 to 28 knots',
            latitude=38.5,
            longitude=-90.0,
            position=Point(-90.0, 38.5, srid=4326),
        )
        assert anomaly.is_resolved is False
        assert anomaly.severity == 'high'

    def test_dead_letter_log(self):
        from vessels.models import DeadLetterLog
        log = DeadLetterLog.objects.create(
            raw_data={'mmsi': '000000000', 'lat': 999, 'lon': 0},
            failure_reason='invalid_latitude',
            source='ais_feed',
        )
        assert log.failure_reason == 'invalid_latitude'


@pytest.mark.django_db
class TestVesselViews:
    def test_vessel_list(self, client):
        from vessels.models import Vessel
        Vessel.objects.create(mmsi='338111111', name='Ohio Pioneer', vessel_type='barge', is_active=True)
        Vessel.objects.create(mmsi='338222222', name='Gulf Star', vessel_type='tanker', is_active=True)
        response = client.get('/api/vessels/')
        assert response.status_code == 200

    def test_vessel_stats(self, client):
        from vessels.models import Vessel
        Vessel.objects.create(mmsi='338333333', name='Prairie Wind', vessel_type='barge', is_active=True)
        response = client.get('/api/vessels/stats/')
        assert response.status_code == 200
        data = response.json()
        assert 'total_vessels' in data
        assert 'active_last_hour' in data

    def test_live_positions_empty(self, client):
        response = client.get('/api/vessels/live_positions/')
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_anomaly_summary(self, client):
        response = client.get('/api/vessels/anomalies/summary/')
        assert response.status_code == 200
        data = response.json()
        assert 'unresolved_total' in data
        assert 'critical_unresolved' in data

    def test_health_check(self, client):
        response = client.get('/api/health/')
        assert response.status_code in (200, 503)
        data = response.json()
        assert 'status' in data
        assert 'checks' in data


class TestAISValidation:
    def test_valid_position_passes(self):
        from vessels.tasks import _validate_position
        pos = {
            'mmsi': '338000001',
            'lat': 38.5,
            'lon': -90.0,
            'speed_over_ground': 8.5,
            'timestamp': timezone.now().isoformat(),
        }
        assert _validate_position(pos) is None

    def test_null_island_rejected(self):
        from vessels.tasks import _validate_position
        pos = {'mmsi': '338000001', 'lat': 0.0, 'lon': 0.0, 'speed_over_ground': 5.0,
               'timestamp': timezone.now().isoformat()}
        assert _validate_position(pos) == 'null_island'

    def test_invalid_latitude_rejected(self):
        from vessels.tasks import _validate_position
        pos = {'mmsi': '338000001', 'lat': 95.0, 'lon': -90.0, 'speed_over_ground': 5.0,
               'timestamp': timezone.now().isoformat()}
        assert _validate_position(pos) == 'invalid_latitude'

    def test_invalid_longitude_rejected(self):
        from vessels.tasks import _validate_position
        pos = {'mmsi': '338000001', 'lat': 38.5, 'lon': 200.0, 'speed_over_ground': 5.0,
               'timestamp': timezone.now().isoformat()}
        assert _validate_position(pos) == 'invalid_longitude'

    def test_impossible_speed_rejected(self):
        from vessels.tasks import _validate_position
        pos = {'mmsi': '338000001', 'lat': 38.5, 'lon': -90.0, 'speed_over_ground': 40.0,
               'timestamp': timezone.now().isoformat()}
        assert _validate_position(pos) == 'impossible_speed'

    def test_future_timestamp_rejected(self):
        from vessels.tasks import _validate_position
        future = (timezone.now() + timedelta(hours=2)).isoformat()
        pos = {'mmsi': '338000001', 'lat': 38.5, 'lon': -90.0, 'speed_over_ground': 5.0,
               'timestamp': future}
        assert _validate_position(pos) == 'future_timestamp'

    def test_missing_coordinates_rejected(self):
        from vessels.tasks import _validate_position
        pos = {'mmsi': '338000001', 'speed_over_ground': 5.0}
        assert _validate_position(pos) == 'missing_coordinates'

    def test_haversine_distance(self):
        from vessels.tasks import _haversine_distance
        # New Orleans to Memphis — approximately 300nm
        dist = _haversine_distance(29.9511, -90.0715, 35.1495, -90.0490)
        assert 290 < dist < 320


class TestAISSimulation:
    def test_simulate_returns_positions(self):
        from vessels.tasks import _simulate_ais_feed
        result = _simulate_ais_feed(['338000001', '338000002', '338000003'])
        assert len(result) == 3
        for pos in result:
            assert 'mmsi' in pos
            assert 'lat' in pos
            assert 'lon' in pos
            assert 'speed_over_ground' in pos
            assert 'course_over_ground' in pos
            assert 'timestamp' in pos

    def test_simulated_positions_are_valid(self):
        from vessels.tasks import _simulate_ais_feed, _validate_position
        result = _simulate_ais_feed(['338111001', '338111002'])
        for pos in result:
            error = _validate_position(pos)
            assert error is None, f'Simulated position failed validation: {error}'

    def test_random_walk_stays_bounded(self):
        from vessels.tasks import _simulate_ais_feed
        mmsi = '338999001'
        for _ in range(20):
            result = _simulate_ais_feed([mmsi])
            pos = result[0]
            assert -90 <= pos['lat'] <= 90
            assert -180 <= pos['lon'] <= 180
            assert 0 <= pos['speed_over_ground'] <= 30
