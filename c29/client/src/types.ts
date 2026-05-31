export interface DeviceData {
  temperature: number;
  pressure: number;
  speed: number;
  isRunning: boolean;
  operationMode: 'normal' | 'warning' | 'critical';
  alarms: Alarm[];
  timestamp: string;
}

export interface Alarm {
  type: 'temperature' | 'pressure' | 'speed';
  level: 'warning' | 'critical';
  message: string;
  part: 'engine' | 'pump' | 'motor';
}

export interface DevicePart {
  name: string;
  position: [number, number, number];
  dataType: 'temperature' | 'pressure' | 'speed';
  color: string;
  warningColor: string;
  criticalColor: string;
  modelPath?: string;
}

export interface ModelLoadState {
  isLoading: boolean;
  progress: number;
  error: string | null;
  loaded: boolean;
}

export interface ModelConfig {
  enabled: boolean;
  path: string;
  scale: [number, number, number];
  position: [number, number, number];
  rotation: [number, number, number];
  enableDraco: boolean;
  enableLod: boolean;
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  enabled: false,
  path: '/models/device.glb',
  scale: [1, 1, 1],
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  enableDraco: true,
  enableLod: true
};

export type AnimationState = 'idle' | 'disassembling' | 'disassembled' | 'assembling' | 'replaying';

export interface PartAnimationConfig {
  partName: string;
  disassembleTarget: [number, number, number];
  disassembleRotation?: [number, number, number];
  delay: number;
  duration: number;
}

export const PART_ANIMATION_CONFIGS: PartAnimationConfig[] = [
  {
    partName: 'engine',
    disassembleTarget: [0, 5, 0],
    disassembleRotation: [0.5, 0.5, 0],
    delay: 0,
    duration: 2
  },
  {
    partName: 'pump',
    disassembleTarget: [-4, 3, -2],
    disassembleRotation: [-0.3, 0.3, 0.5],
    delay: 0.3,
    duration: 1.8
  },
  {
    partName: 'motor',
    disassembleTarget: [4, 3, 2],
    disassembleRotation: [0.3, -0.3, -0.5],
    delay: 0.6,
    duration: 1.8
  }
];

export interface HistoryQuery {
  startTime: string;
  endTime: string;
}

export interface ReplayState {
  isReplaying: boolean;
  currentIndex: number;
  speed: number;
  historyData: DeviceData[];
}

export const DEFAULT_REPLAY_STATE: ReplayState = {
  isReplaying: false,
  currentIndex: -1,
  speed: 1,
  historyData: []
};

export const DEVICE_PARTS: DevicePart[] = [
  {
    name: 'engine',
    position: [0, 1.5, 0],
    dataType: 'temperature',
    color: '#3b82f6',
    warningColor: '#f59e0b',
    criticalColor: '#ef4444'
  },
  {
    name: 'pump',
    position: [-2, 1, 0],
    dataType: 'pressure',
    color: '#10b981',
    warningColor: '#f59e0b',
    criticalColor: '#ef4444'
  },
  {
    name: 'motor',
    position: [2, 1, 0],
    dataType: 'speed',
    color: '#8b5cf6',
    warningColor: '#f59e0b',
    criticalColor: '#ef4444'
  }
];

export const THRESHOLDS = {
  temperature: { min: 0, max: 80, warning: 65 },
  pressure: { min: 5, max: 15, warning: 12 },
  speed: { min: 500, max: 3000, warning: 2500 }
};
