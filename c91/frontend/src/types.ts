export interface Device {
  id: string;
  name: string;
  location: string;
  status: 'normal' | 'warning' | 'critical';
  health_score: number;
  threshold_peak: number;
  threshold_rms: number;
  created_at: string;
}

export interface VibrationData {
  id: number;
  device_id: string;
  timestamp: string;
  raw_data: number[];
  fft_data?: { frequencies: number[]; magnitudes: number[] };
  peak_value: number;
  rms_value: number;
  is_anomaly: number;
}

export interface AnomalyEvent {
  id: number;
  device_id: string;
  timestamp: string;
  event_type: string;
  severity: 'warning' | 'critical';
  description: string;
  peak_value: number;
  rms_value: number;
}

export interface WebSocketMessage {
  type: 'vibration_data' | 'anomaly';
  device_id: string;
  timestamp: string;
  peak_value: number;
  rms_value: number;
  is_anomaly?: boolean;
  severity?: 'warning' | 'critical';
}
