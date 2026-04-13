from django.urls import path
from .health import HealthCheckView

urlpatterns = [
    path('', HealthCheckView.as_view(), name='health-check'),
]
