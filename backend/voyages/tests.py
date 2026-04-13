import pytest
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta


@pytest.mark.django_db
class TestVoyageModel:
    def _make_port(self, name, code, lat, lon):
        from vessels.models import Port
        from django.contrib.gis.geos import Point
        return Port.objects.create(
            name=name, code=code, country='US',
            latitude=lat, longitude=lon,
            position=Point(lon, lat, srid=4326),
            is_inland=True,
        )

    def _make_vessel(self, mmsi='338500001'):
        from vessels.models import Vessel
        return Vessel.objects.create(mmsi=mmsi, name='Mississippi Star', vessel_type='barge')

    def test_voyage_creation(self):
        from voyages.models import Voyage
        origin = self._make_port('New Orleans', 'USNOL', 29.95, -90.07)
        dest = self._make_port('Memphis', 'USMEM', 35.15, -90.05)
        vessel = self._make_vessel()
        voyage = Voyage.objects.create(
            barge=vessel,
            origin_port=origin,
            destination_port=dest,
            status='active',
            cargo_type='grain',
            cargo_weight_tons=15000,
            departure_date=timezone.now(),
            agreed_rate_per_ton=Decimal('4.50'),
            fuel_surcharge=Decimal('2500.00'),
            port_fees_agreed=Decimal('1200.00'),
            total_agreed_cost=Decimal('71200.00'),
        )
        assert voyage.voyage_number.startswith('VYG-')
        assert voyage.cargo_type == 'grain'
        assert voyage.status == 'active'

    def test_voyage_distance_calculated(self):
        from voyages.models import Voyage
        origin = self._make_port('St. Louis', 'USSTL', 38.63, -90.20)
        dest = self._make_port('Cairo', 'USCAI', 37.01, -89.18)
        vessel = self._make_vessel('338500002')
        voyage = Voyage.objects.create(
            barge=vessel, origin_port=origin, destination_port=dest,
            status='planned', cargo_type='coal', cargo_weight_tons=20000,
            departure_date=timezone.now(),
            agreed_rate_per_ton=Decimal('4.00'),
            fuel_surcharge=Decimal('3000.00'),
            port_fees_agreed=Decimal('1500.00'),
            total_agreed_cost=Decimal('84500.00'),
        )
        assert voyage.distance_nm is not None
        assert voyage.distance_nm > 0

    def test_voyage_is_delayed(self):
        from voyages.models import Voyage
        origin = self._make_port('Louisville', 'USLOU', 38.25, -85.76)
        dest = self._make_port('Cincinnati', 'USCIN', 39.10, -84.51)
        vessel = self._make_vessel('338500003')
        past_eta = timezone.now() - timedelta(hours=5)
        voyage = Voyage.objects.create(
            barge=vessel, origin_port=origin, destination_port=dest,
            status='active', cargo_type='steel', cargo_weight_tons=10000,
            departure_date=timezone.now() - timedelta(days=2),
            estimated_arrival=past_eta,
            agreed_rate_per_ton=Decimal('6.00'),
            fuel_surcharge=Decimal('1500.00'),
            port_fees_agreed=Decimal('800.00'),
            total_agreed_cost=Decimal('62300.00'),
        )
        assert voyage.is_delayed is True


@pytest.mark.django_db
class TestVoyageViews:
    def _setup(self):
        from vessels.models import Vessel, Port
        from django.contrib.gis.geos import Point
        origin = Port.objects.create(
            name='Chicago', code='USCHI', country='US',
            latitude=41.88, longitude=-87.63,
            position=Point(-87.63, 41.88, srid=4326), is_inland=True,
        )
        dest = Port.objects.create(
            name='Peoria', code='USPEO', country='US',
            latitude=40.69, longitude=-89.59,
            position=Point(-89.59, 40.69, srid=4326), is_inland=True,
        )
        vessel = Vessel.objects.create(mmsi='338600001', name='Illinois Hawk', vessel_type='barge')
        return origin, dest, vessel

    def test_voyage_list(self, client):
        response = client.get('/api/voyages/')
        assert response.status_code == 200

    def test_voyage_active(self, client):
        response = client.get('/api/voyages/active/')
        assert response.status_code == 200

    def test_dashboard_stats(self, client):
        response = client.get('/api/voyages/dashboard_stats/')
        assert response.status_code == 200
        data = response.json()
        assert 'total_voyages' in data
        assert 'active_voyages' in data
        assert 'by_status' in data
        assert 'monthly_completed' in data
