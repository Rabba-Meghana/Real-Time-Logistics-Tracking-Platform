from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VoyageViewSet, VoyageEventViewSet

router = DefaultRouter()
router.register(r'', VoyageViewSet, basename='voyage')
router.register(r'events', VoyageEventViewSet, basename='voyage-event')

urlpatterns = [path('', include(router.urls))]
