from django.urls import re_path
from .consumers import VesselTrackingConsumer

websocket_urlpatterns = [
    re_path(r'ws/vessels/tracking/$', VesselTrackingConsumer.as_asgi()),
]
