import os
from celery import Celery
from kombu import Queue, Exchange

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

app = Celery('logistics')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

app.conf.task_queues = (
    Queue('ais_ingestion', Exchange('ais_ingestion'), routing_key='ais_ingestion'),
    Queue('invoice_validation', Exchange('invoice_validation'), routing_key='invoice_validation'),
    Queue('voyage_processing', Exchange('voyage_processing'), routing_key='voyage_processing'),
    Queue('high_priority', Exchange('high_priority'), routing_key='high_priority'),
    Queue('celery', Exchange('celery'), routing_key='celery'),
)

app.conf.task_default_queue = 'celery'
app.conf.worker_prefetch_multiplier = 1
app.conf.task_acks_late = True
app.conf.worker_max_tasks_per_child = 1000
