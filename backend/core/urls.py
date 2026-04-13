from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/vessels/', include('vessels.urls')),
    path('api/voyages/', include('voyages.urls')),
    path('api/invoices/', include('invoices.urls')),
    path('api/observability/', include('observability.urls')),
    path('api/health/', include('observability.health_urls')),
]
