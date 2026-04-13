"""
Seed the database with realistic logistics data:
- 200 vessels (barges, tankers, cargo ships)
- 45 inland waterway ports across the US river system
- 50,000+ voyage records spanning 2 years
- 150,000+ vessel position records
- 2,500+ invoices with validation data
- Anomaly logs, voyage events
"""
import random
import math
import json
from datetime import timedelta, date
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from django.contrib.gis.geos import Point, LineString
from faker import Faker

fake = Faker()
random.seed(42)

US_INLAND_PORTS = [
    ('New Orleans', 'USNOL', 'US', 29.9511, -90.0715, True),
    ('Baton Rouge', 'USBTR', 'US', 30.4515, -91.1871, True),
    ('Memphis', 'USMEM', 'US', 35.1495, -90.0490, True),
    ('St. Louis', 'USSTL', 'US', 38.6270, -90.1994, True),
    ('Cairo', 'USCAI', 'US', 37.0050, -89.1762, True),
    ('Cincinnati', 'USCIN', 'US', 39.1031, -84.5120, True),
    ('Louisville', 'USLOU', 'US', 38.2527, -85.7585, True),
    ('Pittsburgh', 'USPGH', 'US', 40.4406, -79.9959, True),
    ('Chicago', 'USCHI', 'US', 41.8781, -87.6298, True),
    ('Peoria', 'USPEO', 'US', 40.6936, -89.5890, True),
    ('Davenport', 'USDVN', 'US', 41.5236, -90.5776, True),
    ('Minneapolis', 'USMSP', 'US', 44.9778, -93.2650, True),
    ('Nashville', 'USBNA', 'US', 36.1627, -86.7816, True),
    ('Knoxville', 'USTYV', 'US', 35.9606, -83.9207, True),
    ('Huntington', 'USHTS', 'US', 38.4192, -82.4452, True),
    ('Paducah', 'USPAH', 'US', 37.0834, -88.6001, True),
    ('Evansville', 'USEVV', 'US', 37.9716, -87.5711, True),
    ('Owensboro', 'USOWB', 'US', 37.7719, -87.1111, True),
    ('Metropolis', 'USMTP', 'US', 37.1506, -88.7320, True),
    ('Alton', 'USALT', 'US', 38.8906, -90.1843, True),
    ('Grafton', 'USGRF', 'US', 38.9673, -90.4315, True),
    ('Cape Girardeau', 'USCGR', 'US', 37.3059, -89.5182, True),
    ('Hannibal', 'USHNB', 'US', 39.7081, -91.3584, True),
    ('Quincy', 'USQCY', 'US', 39.9356, -91.4099, True),
    ('Burlington', 'USBRL', 'US', 40.8074, -91.1128, True),
    ('Rock Island', 'USROI', 'US', 41.5095, -90.5787, True),
    ('Clinton', 'USCLN', 'US', 41.8445, -90.1887, True),
    ('Dubuque', 'USDBQ', 'US', 42.5006, -90.6646, True),
    ('Prairie du Chien', 'USPDC', 'US', 43.0514, -91.1415, True),
    ('La Crosse', 'USLSE', 'US', 43.8014, -91.2396, True),
    ('Winona', 'USWNO', 'US', 44.0499, -91.6393, True),
    ('Red Wing', 'USRDW', 'US', 44.5630, -92.5327, True),
    ('Hastings', 'USHST', 'US', 44.7441, -92.8527, True),
    ('St. Paul', 'USSTP', 'US', 44.9537, -93.0900, True),
    ('Houston Ship Channel', 'USHSC', 'US', 29.7604, -95.3698, True),
    ('Corpus Christi', 'USCRP', 'US', 27.8006, -97.3964, False),
    ('Mobile', 'USMOB', 'US', 30.6954, -88.0399, False),
    ('Pensacola', 'USPNS', 'US', 30.4213, -87.2169, False),
    ('Tampa', 'USTPA', 'US', 27.9506, -82.4572, False),
    ('Savannah', 'USSAV', 'US', 32.0836, -81.0998, False),
    ('Baltimore', 'USBLT', 'US', 39.2904, -76.6122, False),
    ('Philadelphia', 'USPHL', 'US', 39.9526, -75.1652, False),
    ('Norfolk', 'USNFK', 'US', 36.8508, -76.2859, False),
    ('Jacksonville', 'USJAX', 'US', 30.3322, -81.6557, False),
    ('Galveston', 'USGLS', 'US', 29.3013, -94.7977, False),
]

VESSEL_NAMES = [
    'American Spirit', 'River Queen', 'Mississippi Star', 'Ohio Pioneer',
    'Inland Voyager', 'Gulf Current', 'Heartland Express', 'Prairie Trader',
    'Tennessee Belle', 'Missouri Mule', 'Illinois Hawk', 'Kentucky Pride',
    'Delta Mist', 'River Runner', 'Corn Belt Carrier', 'Steel City Barge',
    'Southern Cross', 'Northern Star', 'Western Wind', 'Eastern Dawn',
    'Blue Heron', 'Sandpiper', 'Mallard', 'Cardinal', 'Osprey',
    'Pelican Bay', 'Egret', 'Cormorant', 'Kingfisher', 'Merganser',
    'River Eagle', 'Delta King', 'Gulf Star', 'Inland Sea', 'Prairie Wind',
    'Valley Forge', 'Liberty Belle', 'Constitution', 'Bunker Hill',
    'Yorktown', 'Saratoga', 'Brandywine', 'Monmouth', 'Trenton',
    'Commodore', 'Admiral', 'Captain', 'Navigator', 'Voyager',
]

COMPANIES = [
    'American Waterways Inc', 'Inland Navigation Co', 'River Transport LLC',
    'Gulf Coast Carriers', 'Heartland Logistics', 'Midwest Barge Lines',
    'Southern Rivers Corp', 'Continental Transport', 'National Marine Services',
    'Great River Shipping', 'Valley Transport Solutions', 'Prime Inland Lines',
]

CARGO_WEIGHTS = {
    'grain': (5000, 25000),
    'coal': (8000, 30000),
    'petroleum': (3000, 15000),
    'chemicals': (2000, 10000),
    'containers': (1000, 8000),
    'steel': (3000, 20000),
    'aggregate': (10000, 35000),
    'fertilizer': (4000, 18000),
    'other': (1000, 12000),
}

RATES_PER_TON = {
    'grain': (2.50, 5.50),
    'coal': (3.00, 6.00),
    'petroleum': (4.00, 9.00),
    'chemicals': (6.00, 15.00),
    'containers': (8.00, 20.00),
    'steel': (5.00, 12.00),
    'aggregate': (1.50, 4.00),
    'fertilizer': (3.50, 8.00),
    'other': (2.00, 7.00),
}


def haversine_nm(lat1, lon1, lat2, lon2):
    R = 3440.065
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


class Command(BaseCommand):
    help = 'Seed the database with 50K+ realistic logistics records'

    def add_arguments(self, parser):
        parser.add_argument('--voyages', type=int, default=50000)
        parser.add_argument('--vessels', type=int, default=200)
        parser.add_argument('--positions-per-vessel', type=int, default=750)

    def handle(self, *args, **options):
        self.stdout.write('Seeding database...')
        ports = self._seed_ports()
        self.stdout.write(f'  {len(ports)} ports created')
        vessels = self._seed_vessels(options['vessels'])
        self.stdout.write(f'  {len(vessels)} vessels created')
        voyages = self._seed_voyages(options['voyages'], vessels, ports)
        self.stdout.write(f'  {len(voyages)} voyages created')
        pos_count = self._seed_positions(vessels, options['positions_per_vessel'])
        self.stdout.write(f'  {pos_count} positions created')
        inv_count = self._seed_invoices(voyages)
        self.stdout.write(f'  {inv_count} invoices created')
        self.stdout.write(self.style.SUCCESS('Database seeded successfully.'))

    def _seed_ports(self):
        from vessels.models import Port
        Port.objects.all().delete()
        ports = []
        for name, code, country, lat, lon, inland in US_INLAND_PORTS:
            ports.append(Port(
                name=name, code=code, country=country,
                latitude=lat, longitude=lon,
                position=Point(lon, lat, srid=4326),
                is_inland=inland,
            ))
        Port.objects.bulk_create(ports, ignore_conflicts=True)
        return Port.objects.all()

    def _seed_vessels(self, count):
        from vessels.models import Vessel
        Vessel.objects.all().delete()
        vessel_types = ['barge', 'barge', 'barge', 'cargo', 'cargo', 'tanker', 'tug', 'other']
        flags = ['US', 'US', 'US', 'US', 'PA', 'MH', 'BS']
        vessels = []
        used_mmsis = set()
        for i in range(count):
            while True:
                mmsi = str(random.randint(338000000, 338999999))
                if mmsi not in used_mmsis:
                    used_mmsis.add(mmsi)
                    break
            name = VESSEL_NAMES[i % len(VESSEL_NAMES)]
            if i >= len(VESSEL_NAMES):
                name = f'{name} {i // len(VESSEL_NAMES) + 1}'
            vessels.append(Vessel(
                mmsi=mmsi,
                imo=f'{random.randint(1000000, 9999999)}',
                name=name,
                callsign=fake.lexify('W???').upper(),
                vessel_type=random.choice(vessel_types),
                flag=random.choice(flags),
                length=random.uniform(100, 300),
                width=random.uniform(20, 55),
                draft=random.uniform(2.0, 4.5),
                gross_tonnage=random.randint(800, 8000),
                is_active=True,
            ))
        Vessel.objects.bulk_create(vessels, batch_size=500)
        return list(Vessel.objects.all())

    def _seed_voyages(self, count, vessels, ports):
        from voyages.models import Voyage, VoyageEvent
        Voyage.objects.all().delete()
        VoyageEvent.objects.all().delete()

        port_list = list(ports)
        vessel_list = list(vessels)
        cargo_types = list(CARGO_WEIGHTS.keys())
        statuses = ['completed', 'completed', 'completed', 'completed', 'active', 'active', 'delayed', 'planned']

        now = timezone.now()
        two_years_ago = now - timedelta(days=730)

        voyages_to_create = []
        used_voyage_numbers = set()

        for i in range(count):
            origin = random.choice(port_list)
            destination = random.choice([p for p in port_list if p.id != origin.id])
            cargo_type = random.choice(cargo_types)
            weight_min, weight_max = CARGO_WEIGHTS[cargo_type]
            cargo_weight = round(random.uniform(weight_min, weight_max), 2)
            rate_min, rate_max = RATES_PER_TON[cargo_type]
            rate = round(random.uniform(rate_min, rate_max), 2)
            fuel_surcharge = round(cargo_weight * random.uniform(0.15, 0.45), 2)
            port_fees = round(random.uniform(800, 5000), 2)
            total_cost = round(cargo_weight * rate + fuel_surcharge + port_fees, 2)

            status = random.choice(statuses)
            days_offset = random.randint(0, 720)
            departure = two_years_ago + timedelta(days=days_offset)
            distance = haversine_nm(
                origin.latitude, origin.longitude,
                destination.latitude, destination.longitude,
            )
            avg_speed = random.uniform(5.0, 10.0)
            transit_hours = (distance / avg_speed) if avg_speed > 0 else 72
            transit_hours = max(12, min(transit_hours, 240))
            estimated_arrival = departure + timedelta(hours=transit_hours)
            actual_arrival = None
            if status == 'completed':
                delay_hours = random.gauss(0, 6)
                actual_arrival = estimated_arrival + timedelta(hours=delay_hours)
                if actual_arrival > now:
                    actual_arrival = now - timedelta(hours=random.randint(1, 48))
                    estimated_arrival = actual_arrival - timedelta(hours=transit_hours * 0.1)
            if status in ('active', 'delayed'):
                departure = now - timedelta(hours=random.randint(6, 120))
                estimated_arrival = departure + timedelta(hours=transit_hours)

            while True:
                vnum = f'VYG-{departure.year}-{random.randint(10000, 99999)}'
                if vnum not in used_voyage_numbers:
                    used_voyage_numbers.add(vnum)
                    break

            voyages_to_create.append(Voyage(
                voyage_number=vnum,
                barge=random.choice(vessel_list),
                origin_port=origin,
                destination_port=destination,
                status=status,
                cargo_type=cargo_type,
                cargo_weight_tons=cargo_weight,
                departure_date=departure,
                estimated_arrival=estimated_arrival,
                actual_arrival=actual_arrival,
                distance_nm=round(distance, 2),
                agreed_rate_per_ton=Decimal(str(rate)),
                fuel_surcharge=Decimal(str(fuel_surcharge)),
                port_fees_agreed=Decimal(str(port_fees)),
                total_agreed_cost=Decimal(str(total_cost)),
            ))

            if i % 5000 == 0 and i > 0:
                Voyage.objects.bulk_create(voyages_to_create, batch_size=1000)
                self.stdout.write(f'    {i} voyages...')
                voyages_to_create = []

        if voyages_to_create:
            Voyage.objects.bulk_create(voyages_to_create, batch_size=1000)

        all_voyages = list(Voyage.objects.all())
        sample = random.sample(all_voyages, min(5000, len(all_voyages)))
        events = []
        event_types = ['departed', 'waypoint_reached', 'lock_delay', 'weather_delay', 'arrived']
        for voyage in sample:
            for etype in random.sample(event_types, random.randint(1, 3)):
                events.append(VoyageEvent(
                    voyage=voyage,
                    event_type=etype,
                    description=f'{etype.replace("_", " ").title()} event for {voyage.voyage_number}',
                    occurred_at=voyage.departure_date + timedelta(hours=random.randint(1, 48)),
                ))
        VoyageEvent.objects.bulk_create(events, batch_size=2000, ignore_conflicts=True)
        return all_voyages

    def _seed_positions(self, vessels, positions_per_vessel):
        from vessels.models import VesselPosition
        VesselPosition.objects.all().delete()
        total = 0
        batch = []
        now = timezone.now()
        waterway_lat_lons = [
            (29.9, -90.1), (30.4, -91.2), (35.1, -90.0), (38.6, -90.2),
            (39.1, -84.5), (40.4, -80.0), (41.8, -87.6), (37.0, -88.6),
            (38.3, -85.8), (36.2, -86.8),
        ]
        for vessel in vessels:
            start_ll = random.choice(waterway_lat_lons)
            lat, lon = start_ll[0] + random.uniform(-1, 1), start_ll[1] + random.uniform(-1, 1)
            speed = random.uniform(4, 10)
            course = random.uniform(0, 360)
            for j in range(positions_per_vessel):
                ts = now - timedelta(seconds=(positions_per_vessel - j) * 300 + random.randint(-30, 30))
                speed += random.gauss(0, 0.3)
                speed = max(0.5, min(15.0, speed))
                course += random.gauss(0, 3)
                course %= 360
                dist = speed * (300 / 3600)
                lat += dist * math.cos(math.radians(course)) / 60
                lon += dist * math.sin(math.radians(course)) / (60 * max(math.cos(math.radians(lat)), 0.01))
                lat = max(-89.9, min(89.9, lat))
                lon = max(-179.9, min(179.9, lon))
                batch.append(VesselPosition(
                    vessel=vessel,
                    position=Point(lon, lat, srid=4326),
                    latitude=round(lat, 6),
                    longitude=round(lon, 6),
                    speed_over_ground=round(speed, 1),
                    course_over_ground=round(course, 1),
                    heading=int(course) % 360,
                    nav_status=0 if speed > 0.5 else 1,
                    timestamp=ts,
                    source='ais_feed',
                ))
                total += 1
            if len(batch) >= 5000:
                VesselPosition.objects.bulk_create(batch, ignore_conflicts=True, batch_size=2000)
                batch = []
        if batch:
            VesselPosition.objects.bulk_create(batch, ignore_conflicts=True, batch_size=2000)
        return total

    def _seed_invoices(self, voyages):
        from invoices.models import Invoice
        Invoice.objects.all().delete()
        completed = [v for v in voyages if v.status == 'completed']
        sample = random.sample(completed, min(2500, len(completed)))
        statuses = ['valid', 'valid', 'valid', 'needs_review', 'invalid', 'approved', 'approved']
        invoices = []
        for voyage in sample:
            inv_total = float(voyage.total_agreed_cost) * random.uniform(0.92, 1.08)
            status = random.choice(statuses)
            discrepancies = []
            if status in ('needs_review', 'invalid'):
                discrepancies = [{
                    'field': 'total_amount',
                    'invoice_value': str(round(inv_total, 2)),
                    'voyage_value': str(float(voyage.total_agreed_cost)),
                    'severity': 'major' if status == 'needs_review' else 'critical',
                    'description': 'Invoice total differs from agreed voyage cost',
                }]
            invoices.append(Invoice(
                invoice_number=f'INV-{fake.bothify("??####").upper()}',
                voyage=voyage,
                vendor_name=random.choice(COMPANIES),
                subtotal=Decimal(str(round(inv_total * 0.9, 2))),
                tax_amount=Decimal(str(round(inv_total * 0.1, 2))),
                total_amount=Decimal(str(round(inv_total, 2))),
                validation_status=status,
                discrepancies=discrepancies,
                confidence_score=random.uniform(0.72, 0.99),
                validation_notes='LLM validation completed' if status != 'pending' else '',
                validated_at=voyage.actual_arrival + timedelta(hours=random.randint(2, 48)) if voyage.actual_arrival else None,
                validation_model='claude-opus-4-6',
                uploaded_by=fake.name(),
            ))
        Invoice.objects.bulk_create(invoices, batch_size=500, ignore_conflicts=True)
        return Invoice.objects.count()
