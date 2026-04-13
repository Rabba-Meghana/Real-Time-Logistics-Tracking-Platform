from django.urls import re_path
from channels.generic.websocket import AsyncWebsocketConsumer
import json
from django.utils import timezone


class VoyageUpdatesConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add('voyage_updates', self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard('voyage_updates', self.channel_name)

    async def voyage_update(self, event):
        await self.send(text_data=json.dumps(event['data']))


websocket_urlpatterns = [
    re_path(r'ws/voyages/updates/$', VoyageUpdatesConsumer.as_asgi()),
]
