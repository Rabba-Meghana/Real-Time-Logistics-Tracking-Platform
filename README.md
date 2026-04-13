# Real-Time Logistics Tracking Platform

A full-stack inland waterway barge logistics platform built on Django, Solid.js, PostgreSQL/PostGIS, Celery, Redis, and Groq LLM. Tracks vessel positions via real-time AIS data feeds, manages voyages across US inland waterways, and validates freight invoices using LLM-powered AI.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Solid.js Frontend  (light/dark gold theme, D3 charts)  │
│  Live Map · Voyages · Invoices · Anomalies · Fleet      │
└──────────────────────┬──────────────────────────────────┘
                       │ REST + WebSocket
┌──────────────────────▼──────────────────────────────────┐
│  Django + DRF API  (ASGI / Uvicorn)                     │
│  JWT auth · ViewSets · Filters · Pagination             │
└────┬──────────────┬──────────────┬───────────────────────┘
     │              │              │
┌────▼────┐  ┌──────▼──────┐  ┌───▼──────────────────┐
│PostGIS  │  │Redis Cache  │  │Celery Workers        │
│Voyages  │  │Positions    │  │ais_ingestion (x4)    │
│Positions│  │Sessions     │  │invoice_validation(x2)│
│Invoices │  │Pub/Sub      │  │voyage_processing (x4)│
└─────────┘  └─────────────┘  └──────────────────────┘
                                        │
                               ┌────────▼────────┐
                               │  Groq LLM API   │
                               │  Invoice        │
                               │  Validation     │
                               └─────────────────┘
```

### Data Pipeline — AIS Ingestion

Every 5 minutes Celery Beat fires `fetch_all_vessel_positions`. It chunks active vessel MMSIs into groups of 50 (respecting AIS provider rate limits), dispatches parallel fetch tasks via Celery `group`, validates and deduplicates positions, bulk-inserts to PostgreSQL with `ON CONFLICT DO NOTHING`, and caches the latest position per vessel in Redis with a 10-minute TTL.

### LLM Invoice Validation

On invoice upload, a Celery task extracts structured data from the PDF using `pdfplumber`, constructs a prompt containing the extracted invoice data alongside the voyage's agreed rates from the database, calls the Groq API (`llama-3.3-70b-versatile` by default, configurable via `GROQ_MODEL`), parses the structured JSON response, and classifies the invoice as `valid`, `needs_review`, or `invalid` based on confidence score and discrepancy severity. Falls back to deterministic rule-based validation when `GROQ_API_KEY` is not set.

### Anomaly Detection

Background task runs every 2 minutes, evaluates recent vessel positions for speed spikes (current > 2.5× previous and > 20 knots), position jumps (implied speed > 40 knots between consecutive positions), and unexpected stops (active voyage, speed = 0 for > 30 minutes).

### WebSocket Live Tracking

Django Channels with Redis channel layer. `VesselTrackingConsumer` streams updated vessel positions to all connected clients every 5 seconds. Delta compression reduces bandwidth by sending only changed values. Scales horizontally — multiple Django instances share WebSocket state through Redis.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, Django 4.2, Django REST Framework |
| Async | Django Channels 4, ASGI, Uvicorn |
| Task queue | Celery 5, Redis 7, django-celery-beat |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| LLM | Groq API (llama-3.3-70b-versatile) |
| Frontend | Solid.js, TypeScript, D3.js, Leaflet.js |
| Observability | Datadog APM, distributed tracing, k6 load tests |
| Infrastructure | Docker, docker-compose, GitHub Actions CI/CD |

---

## Quickstart

### Prerequisites

- Docker and docker-compose
- A Groq API key from [console.groq.com](https://console.groq.com) (free tier works)

### 1. Clone and configure

```bash
git clone https://github.com/Rabba-Meghana/Real-Time-Logistics-Tracking-Platform.git
cd Real-Time-Logistics-Tracking-Platform

cp backend/.env.example .env
# Edit .env — set SECRET_KEY and GROQ_API_KEY at minimum
```

### 2. Start all services

```bash
docker-compose up -d
```

This starts PostgreSQL/PostGIS, Redis, the Django API, four Celery worker queues, Celery Beat scheduler, and the Solid.js frontend served by Nginx.

### 3. Seed the database

```bash
docker-compose exec api python manage.py seed_data --voyages 50000 --vessels 200
```

Seeds:
- 200 vessels (barges, tankers, cargo ships, tugs)
- 45 US inland waterway ports across the Mississippi, Ohio, Tennessee, and Illinois river systems
- 50,000 voyage records spanning 2 years
- 150,000 vessel position records
- 2,500 invoices with Groq LLM validation results

### 4. Open the platform

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API | http://localhost:8000/api/ |
| Health check | http://localhost:8000/api/health/ |
| Admin | http://localhost:8000/admin/ |

---

## Configuration

All configuration is read from environment variables. No values are hardcoded.

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | Yes | Django secret key |
| `GROQ_API_KEY` | Yes* | Groq API key for LLM invoice validation |
| `GROQ_MODEL` | No | Groq model (default: `llama-3.3-70b-versatile`) |
| `DB_NAME` | No | PostgreSQL database name (default: `logistics_db`) |
| `DB_USER` | No | PostgreSQL user (default: `postgres`) |
| `DB_PASSWORD` | No | PostgreSQL password |
| `DB_HOST` | No | PostgreSQL host (default: `localhost`) |
| `REDIS_URL` | No | Redis connection URL (default: `redis://localhost:6379/0`) |
| `AWS_ACCESS_KEY_ID` | No | AWS key for S3 invoice PDF storage |
| `AWS_SECRET_ACCESS_KEY` | No | AWS secret for S3 |
| `AWS_STORAGE_BUCKET_NAME` | No | S3 bucket name |
| `DATADOG_API_KEY` | No | Datadog API key for APM tracing |
| `DEBUG` | No | Enable Django debug mode (default: `False`) |

*Falls back to rule-based validation if not set.

### Frontend environment variables

Configured in `frontend/.env` (copy from `frontend/.env.example`):

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend API base URL |
| `VITE_WS_BASE_URL` | `ws://localhost:8000` | WebSocket base URL |
| `VITE_POSITION_REFRESH_MS` | `5000` | Live position poll interval |
| `VITE_MAP_CENTER_LAT` | `38.5` | Default map center latitude |
| `VITE_MAP_CENTER_LON` | `-90.0` | Default map center longitude |
| `VITE_MAP_ZOOM` | `5` | Default map zoom level |

---

## API Reference

### Vessels

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/vessels/` | List all active vessels |
| GET | `/api/vessels/live_positions/` | Current position of all vessels |
| GET | `/api/vessels/{id}/track/?hours=24` | Position history for a vessel |
| GET | `/api/vessels/nearby/?lat=&lon=&radius_km=` | Vessels within radius |
| GET | `/api/vessels/stats/` | Fleet statistics |
| GET | `/api/vessels/anomalies/` | Anomaly log |

### Voyages

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/voyages/` | List voyages (filterable by status, cargo_type) |
| GET | `/api/voyages/active/` | Active and delayed voyages |
| GET | `/api/voyages/dashboard_stats/` | KPIs and monthly breakdown |
| POST | `/api/voyages/` | Create a voyage |
| POST | `/api/voyages/{id}/add_event/` | Log a voyage event |

### Invoices

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/invoices/` | List invoices |
| POST | `/api/invoices/` | Upload invoice (triggers Groq validation) |
| POST | `/api/invoices/{id}/revalidate/` | Re-run LLM validation |
| POST | `/api/invoices/{id}/approve/` | Approve invoice |
| POST | `/api/invoices/{id}/reject/` | Reject invoice |
| GET | `/api/invoices/dashboard_stats/` | Validation statistics |
| GET | `/api/invoices/pending_review/` | Invoices needing review |

---

## Observability

Datadog APM integration is configured via `ddtrace` auto-instrumentation. Set `DATADOG_API_KEY` and `DD_AGENT_HOST` to enable distributed tracing across all services.

The CI/CD pipeline runs k6 load tests (`scripts/k6_load_test.js`) against staging before every production deploy:
- **p99 latency threshold**: < 2000ms
- **Error rate threshold**: < 1%
- **Baseline regression check**: deployment blocked if p99 > previous baseline × 1.20

Failed health checks after deployment trigger automatic rollback via `scripts/rollback.sh`.

---

## Development

```bash
# Backend only (no Docker)
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver

# Celery worker
celery -A core worker -Q ais_ingestion,invoice_validation,voyage_processing,celery -c 4 --loglevel=info

# Celery Beat scheduler
celery -A core beat --loglevel=info

# Frontend only
cd frontend
npm install
npm run dev
```

---

## Project Structure

```
.
├── backend/
│   ├── core/               Django project (settings, URLs, ASGI, Celery)
│   ├── vessels/            AIS ingestion, vessel models, anomaly detection, WebSocket
│   ├── voyages/            Voyage management, ETA calculation, events
│   ├── invoices/           LLM invoice validation pipeline (Groq)
│   ├── observability/      Health checks, metrics endpoint
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/     Sidebar, Header
│   │   ├── pages/          Dashboard, LiveMap, Voyages, Invoices, Anomalies, Fleet
│   │   ├── stores/         Solid.js reactive stores (WebSocket vessel positions)
│   │   ├── styles/         Global CSS, CSS variables, light/dark gold theme
│   │   ├── api.ts          Typed API client (axios)
│   │   ├── config.ts       All config from VITE_ env vars
│   │   └── types.ts        TypeScript interfaces
│   └── package.json
├── scripts/
│   ├── k6_load_test.js     Performance load test with p99 thresholds
│   └── rollback.sh         Scripted rollback on failed health check
├── .github/workflows/
│   └── deploy.yml          CI/CD: test → build → staging → load test → production
└── docker-compose.yml
```
