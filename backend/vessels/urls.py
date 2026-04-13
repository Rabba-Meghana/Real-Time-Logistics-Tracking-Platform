from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VesselViewSet, AnomalyLogViewSet, PortViewSet

router = DefaultRouter()
router.register(r'', VesselViewSet, basename='vessel')
router.register(r'anomalies', AnomalyLogViewSet, basename='anomaly')
router.register(r'ports', PortViewSet, basename='port')

urlpatterns = [
    path('', include(router.urls)),
]
