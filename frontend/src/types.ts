export interface Vessel {
  id: string;
  mmsi: string;
  imo: string;
  name: string;
  callsign: string;
  vessel_type: 'cargo' | 'tanker' | 'barge' | 'tug' | 'passenger' | 'fishing' | 'other';
  flag: string;
  length: number | null;
  width: number | null;
  draft: number | null;
  gross_tonnage: number | null;
  nav_status: number;
  is_active: boolean;
  latest_position: VesselPosition | null;
  position_count: number;
  created_at: string;
  updated_at: string;
}

export interface VesselPosition {
  id: number;
  latitude: number;
  longitude: number;
  speed_over_ground: number;
  course_over_ground: number;
  heading: number;
  nav_status: number;
  timestamp: string;
  source: string;
}

export interface LivePosition {
  vessel_id: string;
  mmsi: string;
  name: string;
  vessel_type: string;
  lat: number;
  lon: number;
  speed: number;
  course: number;
  heading: number;
  nav_status: number;
  timestamp: string;
}

export interface Voyage {
  id: string;
  voyage_number: string;
  barge: string;
  barge_name: string;
  barge_mmsi: string;
  origin_port: string;
  origin_port_name: string;
  origin_port_code: string;
  destination_port: string;
  destination_port_name: string;
  destination_port_code: string;
  status: 'planned' | 'active' | 'delayed' | 'completed' | 'cancelled';
  cargo_type: string;
  cargo_weight_tons: number;
  departure_date: string;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  last_known_position: Record<string, unknown> | null;
  distance_nm: number | null;
  agreed_rate_per_ton: string;
  fuel_surcharge: string;
  port_fees_agreed: string;
  total_agreed_cost: string;
  duration_days: number | null;
  is_delayed: boolean;
  events: VoyageEvent[];
  created_at: string;
}

export interface VoyageEvent {
  id: string;
  event_type: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  occurred_at: string;
  recorded_by: string;
  metadata: Record<string, unknown>;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  voyage: string;
  voyage_number: string;
  vendor_name: string;
  invoice_date: string | null;
  due_date: string | null;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  currency: string;
  validation_status: 'pending' | 'validating' | 'valid' | 'invalid' | 'needs_review' | 'validation_error' | 'approved' | 'rejected';
  discrepancies: Discrepancy[];
  confidence_score: number | null;
  validation_notes: string;
  validated_at: string | null;
  validation_model: string;
  uploaded_by: string;
  uploaded_at: string;
  has_critical_discrepancy: boolean;
  discrepancy_count: number;
}

export interface Discrepancy {
  field: string;
  invoice_value: string;
  voyage_value: string;
  severity: 'minor' | 'major' | 'critical';
  description: string;
}

export interface AnomalyLog {
  id: string;
  vessel_name: string;
  vessel_mmsi: string;
  anomaly_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  latitude: number | null;
  longitude: number | null;
  detected_at: string;
  resolved_at: string | null;
  is_resolved: boolean;
  metadata: Record<string, unknown>;
}

export interface DashboardStats {
  total_voyages: number;
  active_voyages: number;
  delayed_voyages: number;
  completed_last_30d: number;
  total_cargo_tons: number;
  revenue_last_30d: number;
  avg_distance_nm: number;
  by_status: Record<string, number>;
  by_cargo_type: Record<string, number>;
  monthly_completed: Array<{ month: string; count: number }>;
}

export interface Port {
  id: string;
  name: string;
  code: string;
  country: string;
  latitude: number;
  longitude: number;
  is_inland: boolean;
  timezone: string;
}
