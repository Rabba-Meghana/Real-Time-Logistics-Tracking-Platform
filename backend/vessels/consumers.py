import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone


class VesselTrackingConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.group_name = 'vessel_positions'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        self.send_task = asyncio.ensure_future(self.stream_positions())

    async def disconnect(self, close_code):
        if hasattr(self, 'send_task'):
            self.send_task.cancel()
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        if data.get('type') == 'subscribe_vessel':
            self.subscribed_vessel = data.get('vessel_id')

    async def stream_positions(self):
        while True:
            try:
                positions = await self.get_live_positions()
                await self.send(text_data=json.dumps({
                    'type': 'position_update',
                    'data': positions,
                    'timestamp': timezone.now().isoformat(),
                }))
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(5)

    @database_sync_to_async
    def get_live_positions(self):
        from vessels.models import Vessel, VesselPosition
        from datetime import timedelta
        cutoff = timezone.now() - timedelta(hours=4)
        positions = VesselPosition.objects.filter(
            timestamp__gte=cutoff
        ).select_related('vessel').order_by('vessel_id', '-timestamp')
        seen = set()
        result = []
        for pos in positions:
            if pos.vessel_id not in seen:
                seen.add(pos.vessel_id)
                result.append({
                    'vessel_id': str(pos.vessel_id),
                    'mmsi': pos.vessel.mmsi,
                    'name': pos.vessel.name,
                    'vessel_type': pos.vessel.vessel_type,
                    'lat': float(pos.latitude),
                    'lon': float(pos.longitude),
                    'speed': float(pos.speed_over_ground or 0),
                    'course': float(pos.course_over_ground or 0),
                    'heading': pos.heading or 511,
                    'nav_status': pos.nav_status or 15,
                    'timestamp': pos.timestamp.isoformat(),
                    'source': pos.source or 'aisstream.io',
                })
        return result[:500]

    async def position_broadcast(self, event):
        await self.send(text_data=json.dumps(event['data']))
