from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import librosa
import io
import base64
import soundfile as sf
from sklearn.preprocessing import normalize
from scipy import signal
from scipy.ndimage import median_filter
import warnings
warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app)

class AdaptiveNoiseReduction:
    """自适应噪声消除类"""
    
    @staticmethod
    def spectral_subtraction(audio, sr, noise_estimation_duration=0.5):
        """谱减法噪声消除"""
        n_fft = 512
        hop_length = 128
        
        noise_samples = int(noise_estimation_duration * sr)
        noise_samples = min(noise_samples, len(audio) // 4)
        
        if noise_samples < n_fft:
            noise_samples = min(len(audio) // 2, n_fft * 2)
        
        noise_est = audio[:noise_samples]
        
        D_noise = librosa.stft(noise_est, n_fft=n_fft, hop_length=hop_length)
        noise_mag = np.mean(np.abs(D_noise), axis=1, keepdims=True)
        
        D_audio = librosa.stft(audio, n_fft=n_fft, hop_length=hop_length)
        mag_audio = np.abs(D_audio)
        phase_audio = np.angle(D_audio)
        
        alpha = 2.0
        beta = 0.01
        mag_clean = np.maximum(mag_audio - alpha * noise_mag, beta * mag_audio)
        
        D_clean = mag_clean * np.exp(1j * phase_audio)
        audio_clean = librosa.istft(D_clean, hop_length=hop_length, length=len(audio))
        
        return audio_clean
    
    @staticmethod
    def wiener_filter(audio, sr):
        """维纳滤波"""
        n_fft = 512
        hop_length = 128
        
        D = librosa.stft(audio, n_fft=n_fft, hop_length=hop_length)
        mag = np.abs(D)
        phase = np.angle(D)
        
        power = mag ** 2
        noise_power = np.mean(power[:, :10], axis=1, keepdims=True)
        
        snr = power / (noise_power + 1e-10)
        wiener_gain = snr / (snr + 1)
        
        mag_clean = mag * wiener_gain
        D_clean = mag_clean * np.exp(1j * phase)
        audio_clean = librosa.istft(D_clean, hop_length=hop_length, length=len(audio))
        
        return audio_clean
    
    @staticmethod
    def adaptive_threshold(audio, sr):
        """自适应阈值噪声消除"""
        n_fft = 512
        hop_length = 128
        
        D = librosa.stft(audio, n_fft=n_fft, hop_length=hop_length)
        mag = np.abs(D)
        phase = np.angle(D)
        
        local_mean = median_filter(mag, size=(5, 5))
        local_std = np.std(mag, axis=0, keepdims=True)
        
        threshold = local_mean + 0.5 * local_std
        mask = mag > threshold
        
        mag_clean = mag * mask
        D_clean = mag_clean * np.exp(1j * phase)
        audio_clean = librosa.istft(D_clean, hop_length=hop_length, length=len(audio))
        
        return audio_clean
    
    @staticmethod
    def multi_stage_denoising(audio, sr):
        """多级降噪管道"""
        audio = audio.astype(np.float64)
        
        rms = np.sqrt(np.mean(audio ** 2))
        if rms > 0:
            audio = audio / rms
        
        audio = AdaptiveNoiseReduction.spectral_subtraction(audio, sr)
        audio = AdaptiveNoiseReduction.wiener_filter(audio, sr)
        audio = AdaptiveNoiseReduction.adaptive_threshold(audio, sr)
        
        audio = librosa.util.normalize(audio)
        
        return audio

class VoiceActivityDetection:
    """语音活动检测"""
    
    @staticmethod
    def detect_speech_segments(audio, sr, frame_length=0.02, frame_shift=0.01):
        """检测语音段"""
        n_samples = len(audio)
        frame_len = int(frame_length * sr)
        frame_shift = int(frame_shift * sr)
        
        energy = []
        for i in range(0, n_samples - frame_len, frame_shift):
            frame = audio[i:i + frame_len]
            frame_energy = np.sum(frame ** 2)
            energy.append(frame_energy)
        
        energy = np.array(energy)
        energy_smooth = signal.savgol_filter(energy, 5, 2)
        
        threshold = np.mean(energy_smooth) * 0.3
        speech_mask = energy_smooth > threshold
        
        min_speech_frames = int(0.1 / frame_shift)
        for i in range(len(speech_mask) - min_speech_frames):
            if np.sum(speech_mask[i:i + min_speech_frames]) < min_speech_frames // 2:
                speech_mask[i:i + min_speech_frames] = False
        
        return speech_mask, frame_shift
    
    @staticmethod
    def extract_speech_only(audio, sr):
        """仅提取有效语音段"""
        speech_mask, frame_shift = VoiceActivityDetection.detect_speech_segments(audio, sr)
        
        if not np.any(speech_mask):
            return audio
        
        speech_indices = np.where(speech_mask)[0]
        start_sample = speech_indices[0] * frame_shift
        end_sample = (speech_indices[-1] + 1) * frame_shift
        
        start_sample = max(0, start_sample)
        end_sample = min(len(audio), end_sample)
        
        return audio[start_sample:end_sample]

class FeatureExtractor:
    """增强的特征提取器"""
    
    def __init__(self, sample_rate=16000, n_mfcc=40):
        self.sample_rate = sample_rate
        self.n_mfcc = n_mfcc
        self.n_mels = 128
        self.n_fft = 512
        self.hop_length = 128
    
    def extract_mfcc_pyramid(self, audio):
        """多尺度MFCC特征金字塔"""
        features_list = []
        
        mfcc = librosa.feature.mfcc(
            y=audio, sr=self.sample_rate, 
            n_mfcc=self.n_mfcc, n_fft=self.n_fft, 
            hop_length=self.hop_length, n_mels=self.n_mels
        )
        
        mfcc_delta = librosa.feature.delta(mfcc, width=3)
        mfcc_delta2 = librosa.feature.delta(mfcc, order=2, width=3)
        
        features_list.extend([mfcc, mfcc_delta, mfcc_delta2])
        
        mfcc_coarse = librosa.feature.mfcc(
            y=audio, sr=self.sample_rate,
            n_mfcc=self.n_mfcc // 2, n_fft=self.n_fft * 2,
            hop_length=self.hop_length * 2, n_mels=self.n_mels // 2
        )
        
        mfcc_coarse_upsampled = np.repeat(
            np.repeat(mfcc_coarse, 2, axis=1)[:, :mfcc.shape[1]],
            2, axis=0
        )[:self.n_mfcc, :]
        
        features_list.append(mfcc_coarse_upsampled)
        
        return np.vstack(features_list)
    
    def extract_chroma_features(self, audio):
        """色度特征"""
        chroma = librosa.feature.chroma_stft(
            y=audio, sr=self.sample_rate, 
            n_fft=self.n_fft, hop_length=self.hop_length
        )
        return chroma
    
    def extract_spectral_features(self, audio):
        """谱特征"""
        spec_centroid = librosa.feature.spectral_centroid(
            y=audio, sr=self.sample_rate, n_fft=self.n_fft, hop_length=self.hop_length
        )
        spec_bandwidth = librosa.feature.spectral_bandwidth(
            y=audio, sr=self.sample_rate, n_fft=self.n_fft, hop_length=self.hop_length
        )
        spec_rolloff = librosa.feature.spectral_rolloff(
            y=audio, sr=self.sample_rate, n_fft=self.n_fft, hop_length=self.hop_length
        )
        
        return np.vstack([spec_centroid, spec_bandwidth, spec_rolloff])
    
    def extract_complete_features(self, audio):
        """提取完整特征集"""
        mfcc_pyramid = self.extract_mfcc_pyramid(audio)
        spectral = self.extract_spectral_features(audio)
        
        min_frames = min(mfcc_pyramid.shape[1], spectral.shape[1])
        mfcc_pyramid = mfcc_pyramid[:, :min_frames]
        spectral = spectral[:, :min_frames]
        
        return np.vstack([mfcc_pyramid, spectral])

class MultiSampleFusion:
    """多次采样融合策略"""
    
    def __init__(self):
        self.fusion_methods = ['mean', 'median', 'weighted', 'pca']
    
    def temporal_alignment(self, embeddings_list):
        """时间对齐处理"""
        max_len = max(len(e) for e in embeddings_list)
        
        aligned = []
        for emb in embeddings_list:
            if len(emb) < max_len:
                pad_len = max_len - len(emb)
                emb = np.pad(emb, (0, pad_len), mode='edge')
            aligned.append(emb)
        
        return np.array(aligned)
    
    def mean_fusion(self, embeddings_list):
        """均值融合"""
        aligned = self.temporal_alignment(embeddings_list)
        return np.mean(aligned, axis=0)
    
    def median_fusion(self, embeddings_list):
        """中位数融合（更鲁棒）"""
        aligned = self.temporal_alignment(embeddings_list)
        return np.median(aligned, axis=0)
    
    def weighted_fusion(self, embeddings_list, quality_scores=None):
        """加权融合（根据质量分数）"""
        aligned = self.temporal_alignment(embeddings_list)
        
        if quality_scores is None:
            quality_scores = np.ones(len(embeddings_list)) / len(embeddings_list)
        
        quality_scores = np.array(quality_scores)
        quality_scores = quality_scores / np.sum(quality_scores)
        
        weighted = np.sum(aligned * quality_scores[:, np.newaxis], axis=0)
        return weighted
    
    def pca_fusion(self, embeddings_list, n_components=0.95):
        """PCA融合（降维去噪）"""
        aligned = self.temporal_alignment(embeddings_list)
        
        centered = aligned - np.mean(aligned, axis=0)
        cov_matrix = np.cov(centered.T)
        
        eigenvalues, eigenvectors = np.linalg.eigh(cov_matrix)
        
        sorted_indices = np.argsort(eigenvalues)[::-1]
        eigenvalues = eigenvalues[sorted_indices]
        eigenvectors = eigenvectors[:, sorted_indices]
        
        cumulative_variance = np.cumsum(eigenvalues) / np.sum(eigenvalues)
        n_components = np.argmax(cumulative_variance >= n_components) + 1
        
        projected = np.dot(centered, eigenvectors[:, :n_components])
        reconstructed = np.dot(projected, eigenvectors[:, :n_components].T) + np.mean(aligned, axis=0)
        
        return np.mean(reconstructed, axis=0)
    
    def ensemble_fusion(self, embeddings_list, quality_scores=None):
        """集成融合（多种方法结合）"""
        mean_emb = self.mean_fusion(embeddings_list)
        median_emb = self.median_fusion(embeddings_list)
        weighted_emb = self.weighted_fusion(embeddings_list, quality_scores)
        
        ensemble = (mean_emb + median_emb + weighted_emb) / 3
        
        return ensemble

class RobustMatcher:
    """鲁棒匹配器"""
    
    def __init__(self):
        self.similarity_methods = ['cosine', 'pearson', 'euclidean', 'mahalanobis']
    
    def cosine_similarity(self, emb1, emb2):
        """余弦相似度"""
        emb1_normalized = normalize(emb1.reshape(1, -1))[0]
        emb2_normalized = normalize(emb2.reshape(1, -1))[0]
        return np.dot(emb1_normalized, emb2_normalized)
    
    def pearson_correlation(self, emb1, emb2):
        """皮尔逊相关系数"""
        return np.corrcoef(emb1, emb2)[0, 1]
    
    def euclidean_similarity(self, emb1, emb2):
        """欧氏距离转换的相似度"""
        distance = np.linalg.norm(emb1 - emb2)
        return 1 / (1 + distance)
    
    def adaptive_threshold(self, similarities, noise_level=0):
        """自适应阈值判断"""
        weights = {
            'cosine': 0.5,
            'pearson': 0.3,
            'euclidean': 0.2
        }
        
        weighted_sum = (
            weights['cosine'] * similarities['cosine'] +
            weights['pearson'] * similarities['pearson'] +
            weights['euclidean'] * similarities['euclidean']
        )
        
        base_threshold = 0.75
        noise_penalty = noise_level * 0.1
        adaptive_threshold = base_threshold - noise_penalty
        
        return weighted_sum, adaptive_threshold
    
    def verify(self, emb1, emb2, noise_level=0):
        """多指标验证"""
        similarities = {
            'cosine': self.cosine_similarity(emb1, emb2),
            'pearson': self.pearson_correlation(emb1, emb2),
            'euclidean': self.euclidean_similarity(emb1, emb2)
        }
        
        final_score, threshold = self.adaptive_threshold(similarities, noise_level)
        
        return {
            'final_score': float(final_score),
            'threshold': float(threshold),
            'verified': bool(final_score >= threshold),
            'details': {k: float(v) for k, v in similarities.items()}
        }

class EnhancedVoiceVerification:
    """增强的声纹验证系统"""
    
    def __init__(self):
        self.sample_rate = 16000
        self.noise_reduction = AdaptiveNoiseReduction()
        self.vad = VoiceActivityDetection()
        self.feature_extractor = FeatureExtractor(sample_rate=self.sample_rate)
        self.fusion = MultiSampleFusion()
        self.matcher = RobustMatcher()
        
        self.template_store = {}
    
    def estimate_noise_level(self, audio):
        """估计噪声水平"""
        if len(audio) < self.sample_rate * 0.5:
            return 0.0
        
        noise_est = audio[:int(self.sample_rate * 0.3)]
        noise_rms = np.sqrt(np.mean(noise_est ** 2))
        signal_rms = np.sqrt(np.mean(audio ** 2))
        
        snr = 10 * np.log10((signal_rms ** 2) / (noise_rms ** 2 + 1e-10))
        noise_level = max(0, min(1, (30 - snr) / 30))
        
        return noise_level
    
    def extract_embedding(self, audio_data, denoise=True, vad=True):
        """提取单个声纹嵌入向量"""
        audio_bytes = base64.b64decode(audio_data)
        audio_file = io.BytesIO(audio_bytes)
        
        y, sr = sf.read(audio_file)
        
        if len(y.shape) > 1:
            y = y[:, 0]
        
        if sr != self.sample_rate:
            y = librosa.resample(y, orig_sr=sr, target_sr=self.sample_rate)
        
        noise_level = self.estimate_noise_level(y)
        
        if denoise and noise_level > 0.1:
            y = self.noise_reduction.multi_stage_denoising(y, self.sample_rate)
        
        if vad:
            y = self.vad.extract_speech_only(y, self.sample_rate)
        
        if len(y) < self.sample_rate * 0.5:
            features = self.feature_extractor.extract_complete_features(y)
            embedding = np.concatenate([
                np.mean(features, axis=1),
                np.std(features, axis=1),
                np.percentile(features, 25, axis=1),
                np.percentile(features, 75, axis=1)
            ])
        else:
            features = self.feature_extractor.extract_complete_features(y)
            
            segment_size = self.sample_rate // 4
            hop_size = self.sample_rate // 8
            
            segment_embeddings = []
            for i in range(0, max(1, len(y) - segment_size), hop_size):
                segment = y[i:min(i + segment_size, len(y))]
                if len(segment) > 100:
                    seg_features = self.feature_extractor.extract_complete_features(segment)
                    seg_emb = np.mean(seg_features, axis=1)
                    segment_embeddings.append(seg_emb)
            
            if len(segment_embeddings) > 1:
                embedding = self.fusion.ensemble_fusion(segment_embeddings)
            else:
                embedding = np.mean(features, axis=1)
        
        embedding = normalize(embedding.reshape(1, -1))[0]
        
        return embedding.tolist(), float(noise_level)
    
    def extract_multi_sample_embedding(self, audio_samples, fusion_method='ensemble'):
        """多次采样融合提取模板嵌入"""
        embeddings = []
        noise_levels = []
        quality_scores = []
        
        for audio_data in audio_samples:
            emb, noise_level = self.extract_embedding(audio_data, denoise=True, vad=True)
            embeddings.append(np.array(emb))
            noise_levels.append(noise_level)
            quality_scores.append(1.0 / (1.0 + noise_level))
        
        if fusion_method == 'mean':
            fused = self.fusion.mean_fusion(embeddings)
        elif fusion_method == 'median':
            fused = self.fusion.median_fusion(embeddings)
        elif fusion_method == 'weighted':
            fused = self.fusion.weighted_fusion(embeddings, quality_scores)
        elif fusion_method == 'pca':
            fused = self.fusion.pca_fusion(embeddings)
        else:
            fused = self.fusion.ensemble_fusion(embeddings, quality_scores)
        
        fused = normalize(fused.reshape(1, -1))[0]
        
        return {
            'embedding': fused.tolist(),
            'num_samples': len(audio_samples),
            'avg_noise_level': float(np.mean(noise_levels)),
            'quality_score': float(np.mean(quality_scores))
        }
    
    def verify_voice(self, verify_embedding, template_embedding, verify_noise_level=0):
        """验证声纹"""
        verify_emb = np.array(verify_embedding)
        template_emb = np.array(template_embedding)
        
        result = self.matcher.verify(verify_emb, template_emb, verify_noise_level)
        
        return result

voice_verifier = EnhancedVoiceVerification()

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'message': '增强声纹验证服务运行正常',
        'features': [
            '自适应噪声消除（谱减法+维纳滤波+自适应阈值）',
            '语音活动检测（VAD）',
            '多尺度MFCC特征金字塔',
            '多次采样融合（均值/中位数/加权/PCA/集成）',
            '多指标鲁棒匹配（余弦+皮尔逊+欧氏）',
            '自适应阈值'
        ]
    })

@app.route('/extract-embedding', methods=['POST'])
def extract_embedding():
    try:
        data = request.get_json()
        
        if 'audio' not in data:
            return jsonify({'error': '缺少音频数据'}), 400
        
        audio_data = data['audio']
        
        if audio_data.startswith('data:audio'):
            audio_data = audio_data.split(',')[1]
        
        denoise = data.get('denoise', True)
        vad = data.get('vad', True)
        
        embedding, noise_level = voice_verifier.extract_embedding(
            audio_data, denoise=denoise, vad=vad
        )
        
        return jsonify({
            'success': True,
            'embedding': embedding,
            'embedding_size': len(embedding),
            'noise_level': noise_level,
            'quality_score': 1.0 / (1.0 + noise_level)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/extract-template', methods=['POST'])
def extract_template():
    try:
        data = request.get_json()
        
        if 'audio_samples' not in data:
            return jsonify({'error': '缺少音频样本列表'}), 400
        
        audio_samples = data['audio_samples']
        
        processed_samples = []
        for audio_data in audio_samples:
            if audio_data.startswith('data:audio'):
                audio_data = audio_data.split(',')[1]
            processed_samples.append(audio_data)
        
        fusion_method = data.get('fusion_method', 'ensemble')
        
        result = voice_verifier.extract_multi_sample_embedding(
            processed_samples, fusion_method=fusion_method
        )
        
        return jsonify({
            'success': True,
            **result
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/verify', methods=['POST'])
def verify():
    try:
        data = request.get_json()
        
        if 'verify_embedding' not in data or 'template_embedding' not in data:
            return jsonify({'error': '缺少嵌入向量数据'}), 400
        
        verify_embedding = data['verify_embedding']
        template_embedding = data['template_embedding']
        noise_level = data.get('noise_level', 0)
        
        result = voice_verifier.verify_voice(
            verify_embedding, template_embedding, noise_level
        )
        
        return jsonify({
            'success': True,
            **result
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/verify-audio', methods=['POST'])
def verify_audio():
    try:
        data = request.get_json()
        
        if 'verify_audio' not in data or 'template_embedding' not in data:
            return jsonify({'error': '缺少音频或模板数据'}), 400
        
        verify_audio = data['verify_audio']
        template_embedding = data['template_embedding']
        
        if verify_audio.startswith('data:audio'):
            verify_audio = verify_audio.split(',')[1]
        
        verify_embedding, noise_level = voice_verifier.extract_embedding(
            verify_audio, denoise=True, vad=True
        )
        
        result = voice_verifier.verify_voice(
            verify_embedding, template_embedding, noise_level
        )
        
        return jsonify({
            'success': True,
            'noise_level': noise_level,
            **result
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)