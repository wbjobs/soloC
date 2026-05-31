import { create } from 'zustand';
import { shallow } from 'zustand/shallow';
import { DeviceData, Alarm, ModelLoadState, ModelConfig, DEFAULT_MODEL_CONFIG, AnimationState, ReplayState, DEFAULT_REPLAY_STATE } from './types';

interface WebSocketStore {
  connected: boolean;
  data: DeviceData | null;
  history: DeviceData[];
  alarms: Alarm[];
  modelState: ModelLoadState;
  modelConfig: ModelConfig;
  animationState: AnimationState;
  replayState: ReplayState;
  connect: () => void;
  disconnect: () => void;
  sendControl: (action: string, value?: any) => void;
  setModelConfig: (config: Partial<ModelConfig>) => void;
  setModelState: (state: Partial<ModelLoadState>) => void;
  playDisassemble: () => void;
  playAssemble: () => void;
  setAnimationState: (state: AnimationState) => void;
  loadHistory: (startTime: string, endTime: string) => Promise<DeviceData[]>;
  startReplay: (historyData: DeviceData[]) => void;
  stopReplay: () => void;
  setReplayIndex: (index: number) => void;
  setReplaySpeed: (speed: number) => void;
  setReplayData: (data: DeviceData) => void;
}

let ws: WebSocket | null = null;

export const useStore = create<WebSocketStore>((set, get) => ({
  connected: false,
  data: null,
  history: [],
  alarms: [],
  modelState: {
    isLoading: false, progress: 0, error: null, loaded: false
  },
  modelConfig: DEFAULT_MODEL_CONFIG,
  animationState: 'idle',
  replayState: DEFAULT_REPLAY_STATE,

  connect: () => {
    if (ws) return;

    ws = new WebSocket('ws://localhost:8080');

    ws.onopen = () => {
      set({ connected: true });
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'data' || message.type === 'init' || message.type === 'control_ack') {
          const state = get();
          if (state.replayState.isReplaying) return;
          
          const data = message.data as DeviceData;
          const prevData = state.data;
          
          if (!prevData || 
              prevData.temperature !== data.temperature ||
              prevData.pressure !== data.pressure ||
              prevData.speed !== data.speed ||
              prevData.isRunning !== data.isRunning ||
              JSON.stringify(prevData.alarms) !== JSON.stringify(data.alarms)) {
            set({
              data,
              history: [...state.history.slice(-99), data],
              alarms: data.alarms
            });
          }
        }
      } catch (e) {
        console.error('Parse error:', e);
      }
    };

    ws.onclose = () => {
      set({ connected: false });
      ws = null;
      console.log('WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  },

  disconnect: () => {
    if (ws) {
      ws.close();
      ws = null;
      set({ connected: false });
    }
  },

  sendControl: (action, value) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'control',
        payload: { action, value }
      }));
    }
  },

  setModelConfig: (config) => {
    set((state) => ({
      modelConfig: { ...state.modelConfig, ...config }
    }));
  },

  setModelState: (state) => {
    set((s) => ({
      modelState: { ...s.modelState, ...state }
    }));
  },

  playDisassemble: () => {
    const state = get();
    if (state.animationState === 'disassembling' || state.animationState === 'disassembled') return;
    set({ animationState: 'disassembling' });
  },

  playAssemble: () => {
    const state = get();
    if (state.animationState === 'assembling' || state.animationState === 'idle') return;
    set({ animationState: 'assembling' });
  },

  setAnimationState: (state) => {
    set({ animationState: state });
  },

  loadHistory: async (startTime, endTime) => {
    try {
      const response = await fetch(`/api/history?startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`);
      if (!response.ok) throw new Error('Failed to load history');
      const data = await response.json();
      return data.history || [];
    } catch (error) {
      console.error('History load error:', error);
      return [];
    }
  },

  startReplay: (historyData) => {
    if (historyData.length === 0) return;
    set({
      replayState: {
        isReplaying: true,
        currentIndex: 0,
        speed: 1,
        historyData
      },
      animationState: 'replaying'
    });
  },

  stopReplay: () => {
    set({
      replayState: DEFAULT_REPLAY_STATE,
      animationState: 'idle'
    });
  },

  setReplayIndex: (index) => {
    set((state) => {
      const clampedIndex = Math.max(0, Math.min(index, state.replayState.historyData.length - 1));
      const data = state.replayState.historyData[clampedIndex];
      return {
        replayState: { ...state.replayState, currentIndex: clampedIndex },
        data,
        alarms: data.alarms
      };
    });
  },

  setReplaySpeed: (speed) => {
    set((state) => ({
      replayState: { ...state.replayState, speed }
    }));
  },

  setReplayData: (data) => {
    set({
      data,
      alarms: data.alarms
    });
  }
}));

export const useConnection = () => useStore((state) => state.connected, shallow);
export const useData = () => useStore((state) => ({
  temperature: state.data?.temperature,
  pressure: state.data?.pressure,
  speed: state.data?.speed,
  isRunning: state.data?.isRunning,
  operationMode: state.data?.operationMode
}), shallow);
export const useAlarms = () => useStore((state) => state.alarms, shallow);
export const usePartData = (partName: string) => useStore((state) => {
  const data = state.data;
  const alarms = state.alarms;
  const partAlarms = alarms.filter(a => a.part === partName);
  return { data, alarms: partAlarms };
}, shallow);
export const useModelState = () => useStore((state) => state.modelState, shallow);
export const useModelConfig = () => useStore((state) => state.modelConfig, shallow);
export const useAnimationState = () => useStore((state) => state.animationState, shallow);
export const useReplayState = () => useStore((state) => state.replayState, shallow);
export const useHistory = () => useStore((state) => state.history, shallow);
