import numpy as np
from scipy import signal
from typing import Dict, List, Tuple
import json


class PhaseLockingAnalyzer:
    def __init__(self, sampling_rate: int = 256, n_channels: int = 4):
        self.sampling_rate = sampling_rate
        self.n_channels = n_channels
        self.frequency_bands = {
            'alpha': (8, 13),
            'beta': (13, 30),
            'theta': (4, 8),
            'delta': (0.5, 4),
            'gamma': (30, 50)
        }

    def compute_instantaneous_phase(self, data: np.ndarray, freq_band: Tuple[float, float]) -> np.ndarray:
        nyquist = self.sampling_rate / 2
        low, high = freq_band
        b, a = signal.butter(4, [low/nyquist, high/nyquist], btype='band')
        filtered = signal.filtfilt(b, a, data, axis=1)
        
        analytic = signal.hilbert(filtered, axis=1)
        phase = np.angle(analytic)
        
        return phase

    def compute_plv_pair(self, phase1: np.ndarray, phase2: np.ndarray) -> float:
        phase_diff = phase1 - phase2
        plv = np.abs(np.mean(np.exp(1j * phase_diff)))
        return float(plv)

    def compute_group_plv(self, participant_data: List[np.ndarray]) -> Dict[str, float]:
        n_participants = len(participant_data)
        if n_participants < 2:
            return {'global': 0.0}

        plv_values = {}
        
        for band_name, freq_range in self.frequency_bands.items():
            phases = []
            for data in participant_data:
                phase = self.compute_instantaneous_phase(data, freq_range)
                phases.append(phase)
            
            pairwise_plvs = []
            for i in range(n_participants):
                for j in range(i + 1, n_participants):
                    plv = self.compute_plv_pair(phases[i], phases[j])
                    pairwise_plvs.append(plv)
            
            plv_values[band_name] = np.mean(pairwise_plvs) if pairwise_plvs else 0.0

        overall_plv = np.mean(list(plv_values.values()))
        plv_values['global'] = float(overall_plv)
        
        return plv_values

    def compute_attention_distribution(self, attention_scores: List[float]) -> Dict:
        if not attention_scores:
            return {'distribution': [], 'mean': 0, 'variance': 0}
        
        n = len(attention_scores)
        mean_att = np.mean(attention_scores)
        var_att = np.var(attention_scores)
        
        distribution = []
        for i, score in enumerate(attention_scores):
            distribution.append({
                'participant': i + 1,
                'score': score,
                'deviation': score - mean_att
            })
        
        return {
            'distribution': distribution,
            'mean': float(mean_att),
            'variance': float(var_att),
            'n_participants': n
        }


class GroupSessionManager:
    def __init__(self, max_participants: int = 4):
        self.max_participants = max_participants
        self.active_sessions: Dict[str, 'GroupSession'] = {}

    def create_session(self, session_name: str) -> str:
        session_id = f"group_{np.random.randint(1000, 9999)}"
        self.active_sessions[session_id] = GroupSession(session_id, session_name, self.max_participants)
        return session_id

    def get_session(self, session_id: str) -> 'GroupSession':
        return self.active_sessions.get(session_id)

    def remove_session(self, session_id: str):
        if session_id in self.active_sessions:
            del self.active_sessions[session_id]


class GroupSession:
    def __init__(self, session_id: str, name: str, max_participants: int):
        self.session_id = session_id
        self.name = name
        self.max_participants = max_participants
        self.participants: Dict[str, Dict] = {}
        self.analyzer = PhaseLockingAnalyzer()
        self.buffer_size = 256
        self.data_buffers: Dict[str, np.ndarray] = {}
        self.buffer_indices: Dict[str, int] = {}

    def add_participant(self, participant_id: str, participant_name: str) -> bool:
        if len(self.participants) >= self.max_participants:
            return False
        
        self.participants[participant_id] = {
            'name': participant_name,
            'connected': True,
            'attention_scores': []
        }
        self.data_buffers[participant_id] = np.zeros((4, self.buffer_size))
        self.buffer_indices[participant_id] = 0
        return True

    def remove_participant(self, participant_id: str):
        if participant_id in self.participants:
            self.participants[participant_id]['connected'] = False

    def add_eeg_data(self, participant_id: str, channel_data: List[float]) -> bool:
        if participant_id not in self.participants:
            return False
        
        idx = self.buffer_indices[participant_id]
        self.data_buffers[participant_id][:, idx] = channel_data[:4]
        self.buffer_indices[participant_id] = (idx + 1) % self.buffer_size
        
        return self.buffer_indices[participant_id] == 0

    def compute_sync_metrics(self) -> Dict:
        active_participants = [
            pid for pid, p in self.participants.items() 
            if p['connected'] and np.any(self.data_buffers[pid] != 0)
        ]
        
        if len(active_participants) < 2:
            return {
                'plv_values': {'global': 0},
                'attention_distribution': {},
                'n_participants': len(active_participants)
            }

        participant_data = [self.data_buffers[pid] for pid in active_participants]
        plv_values = self.analyzer.compute_group_plv(participant_data)
        
        attention_scores = []
        for pid in active_participants:
            scores = self.participants[pid]['attention_scores']
            attention_scores.append(scores[-1] if scores else 50)
        
        attention_dist = self.analyzer.compute_attention_distribution(attention_scores)
        
        return {
            'plv_values': plv_values,
            'attention_distribution': attention_dist,
            'n_participants': len(active_participants),
            'participants': [
                {'id': pid, 'name': self.participants[pid]['name']}
                for pid in active_participants
            ]
        }

    def update_attention(self, participant_id: str, score: float):
        if participant_id in self.participants:
            self.participants[participant_id]['attention_scores'].append(score)


group_manager = GroupSessionManager()
