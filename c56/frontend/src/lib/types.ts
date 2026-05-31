export interface TimeSeriesPoint {
	timestamp: string;
	value: number;
}

export interface TimeSeries {
	name: string;
	labels: Record<string, string>;
	points: [string, number][];
}

export interface QueryResult {
	series: TimeSeries[];
}

export interface AlertRule {
	id: string;
	name: string;
	query: string;
	database_type: string;
	threshold: number;
	threshold_type: 'above' | 'below' | 'equal' | 'not_equal';
	level: 'info' | 'warning' | 'critical';
	duration: string;
	enabled: boolean;
	created_at: string;
	last_triggered?: string;
}

export interface Alert {
	id: string;
	rule_id: string;
	rule_name: string;
	level: 'info' | 'warning' | 'critical';
	message: string;
	timestamp: string;
	value: number;
	threshold: number;
}

export const API_BASE = 'http://localhost:8080/api';
