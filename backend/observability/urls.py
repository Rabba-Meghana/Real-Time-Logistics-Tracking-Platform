from django.urls import path
from .views import metrics_summary

urlpatterns = [
    path('metrics/', metrics_summary, name='metrics-summary'),
]
