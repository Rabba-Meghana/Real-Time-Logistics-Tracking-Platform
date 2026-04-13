import django
from django.conf import settings


def pytest_configure(config):
    if not settings.configured:
        settings.configure(
            DATABASES={
                'default': {
                    'ENGINE': 'django.contrib.gis.db.backends.postgis',
                    'NAME': 'logistics_test',
                    'USER': 'postgres',
                    'PASSWORD': 'postgres',
                    'HOST': 'localhost',
                    'PORT': '5432',
                }
            },
            INSTALLED_APPS=[
                'django.contrib.contenttypes',
                'django.contrib.auth',
                'django.contrib.gis',
                'rest_framework',
                'corsheaders',
                'django_filters',
                'channels',
                'vessels',
                'voyages',
                'invoices',
                'observability',
            ],
            SECRET_KEY='test-secret-key',
            DEBUG=True,
            USE_TZ=True,
            DEFAULT_AUTO_FIELD='django.db.models.BigAutoField',
            REDIS_URL='redis://localhost:6379/0',
            CELERY_TASK_ALWAYS_EAGER=True,
            CELERY_TASK_EAGER_PROPAGATES=True,
            CACHES={
                'default': {
                    'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
                }
            },
            CHANNEL_LAYERS={
                'default': {
                    'BACKEND': 'channels.layers.InMemoryChannelLayer',
                }
            },
            REST_FRAMEWORK={
                'DEFAULT_AUTHENTICATION_CLASSES': [],
                'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.AllowAny'],
            },
            GROQ_API_KEY='',
            GROQ_MODEL='llama-3.3-70b-versatile',
            AWS_ACCESS_KEY_ID='',
            AWS_SECRET_ACCESS_KEY='',
            AWS_STORAGE_BUCKET_NAME='',
            AWS_S3_REGION_NAME='us-east-1',
            DATADOG_API_KEY='',
        )
