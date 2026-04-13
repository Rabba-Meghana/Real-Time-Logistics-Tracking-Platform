import axios from 'axios';
import { config } from './config';

export const api = axios.create({
  baseURL: `${config.apiBaseUrl}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('access_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        try {
          const { data } = await axios.post(`${config.apiBaseUrl}/api/auth/token/refresh/`, { refresh });
          localStorage.setItem('access_token', data.access);
          err.config.headers.Authorization = `Bearer ${data.access}`;
          return api.request(err.config);
        } catch {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      }
    }
    return Promise.reject(err);
  }
);

// Typed API methods
export const vesselsApi = {
  list: () => api.get('/vessels/'),
  livePositions: () => api.get('/vessels/live_positions/'),
  track: (id: string, hours = 24) => api.get(`/vessels/${id}/track/?hours=${hours}`),
  nearby: (lat: number, lon: number, radiusKm = 50) =>
    api.get(`/vessels/nearby/?lat=${lat}&lon=${lon}&radius_km=${radiusKm}`),
  stats: () => api.get('/vessels/stats/'),
  anomalies: () => api.get('/vessels/anomalies/'),
  anomalySummary: () => api.get('/vessels/anomalies/summary/'),
  ports: () => api.get('/vessels/ports/'),
};

export const voyagesApi = {
  list: (params?: Record<string, string>) => api.get('/voyages/', { params }),
  detail: (id: string) => api.get(`/voyages/${id}/`),
  active: () => api.get('/voyages/active/'),
  dashboardStats: () => api.get('/voyages/dashboard_stats/'),
  create: (data: unknown) => api.post('/voyages/', data),
  update: (id: string, data: unknown) => api.patch(`/voyages/${id}/`, data),
  addEvent: (id: string, data: unknown) => api.post(`/voyages/${id}/add_event/`, data),
};

export const invoicesApi = {
  list: (params?: Record<string, string>) => api.get('/invoices/', { params }),
  detail: (id: string) => api.get(`/invoices/${id}/`),
  create: (data: unknown) => api.post('/invoices/', data),
  revalidate: (id: string) => api.post(`/invoices/${id}/revalidate/`),
  approve: (id: string, approvedBy: string) =>
    api.post(`/invoices/${id}/approve/`, { approved_by: approvedBy }),
  reject: (id: string) => api.post(`/invoices/${id}/reject/`),
  dashboardStats: () => api.get('/invoices/dashboard_stats/'),
  pendingReview: () => api.get('/invoices/pending_review/'),
};

export const observabilityApi = {
  health: () => api.get('/health/'),
  metrics: () => api.get('/observability/metrics/'),
};
