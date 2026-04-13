from django.http import JsonResponse
from django.views import View
from django.utils import timezone
import django.db


class HealthCheckView(View):
    def get(self, request):
        checks = {}
        overall = 'healthy'
        try:
            django.db.connection.ensure_connection()
            checks['database'] = {'status': 'healthy'}
        except Exception as e:
            checks['database'] = {'status': 'unhealthy', 'error': str(e)}
            overall = 'unhealthy'
        try:
            from django.core.cache import cache
            cache.set('health_check', 'ok', timeout=5)
            val = cache.get('health_check')
            checks['redis'] = {'status': 'healthy' if val == 'ok' else 'degraded'}
        except Exception as e:
            checks['redis'] = {'status': 'unhealthy', 'error': str(e)}
            overall = 'degraded'
        try:
            from celery import current_app
            inspect = current_app.control.inspect(timeout=1.0)
            workers = inspect.ping()
            checks['celery'] = {
                'status': 'healthy' if workers else 'degraded',
                'workers': len(workers) if workers else 0,
            }
        except Exception as e:
            checks['celery'] = {'status': 'unknown', 'error': str(e)}
        return JsonResponse({
            'status': overall,
            'timestamp': timezone.now().isoformat(),
            'checks': checks,
        }, status=200 if overall in ('healthy', 'degraded') else 503)
