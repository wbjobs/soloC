import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, FlatList } from 'react-native';
import { Audio } from 'expo-av';
import axios from 'axios';

const API_URL = 'http://localhost:3000/api';
const REQUIRED_SAMPLES = 3;

export default function RegisterScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioSamples, setAudioSamples] = useState([]);
  const [fusionMethod, setFusionMethod] = useState('ensemble');
  const recordingRef = useRef(null);

  async function startRecording() {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (err) {
      Alert.alert('错误', '无法启动录音');
    }
  }

  async function stopRecording() {
    setIsRecording(false);
    setIsProcessing(true);

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      
      const base64Audio = await fetch(uri).then(res => res.text());
      
      const newSample = {
        id: Date.now().toString(),
        audio: base64Audio,
        timestamp: new Date().toLocaleString(),
        index: audioSamples.length + 1
      };
      
      setAudioSamples([...audioSamples, newSample]);
      Alert.alert('成功', `录音 ${audioSamples.length + 1}/${REQUIRED_SAMPLES} 已保存`);
    } catch (err) {
      Alert.alert('错误', '录音保存失败');
    } finally {
      setIsProcessing(false);
    }
  }

  function removeSample(id) {
    setAudioSamples(audioSamples.filter(s => s.id !== id));
  }

  async function handleRegister() {
    if (!email || !name || audioSamples.length < REQUIRED_SAMPLES) {
      Alert.alert('提示', `请填写所有信息并录制至少 ${REQUIRED_SAMPLES} 个声纹样本`);
      return;
    }

    try {
      setIsProcessing(true);
      const audioDataArray = audioSamples.map(s => s.audio);
      
      await axios.post(`${API_URL}/users/register-multi`, {
        email,
        name,
        audioSamples: audioDataArray,
        fusionMethod
      });
      
      Alert.alert('成功', '多采样声纹注册成功！请登录');
      navigation.navigate('Login');
    } catch (err) {
      Alert.alert('错误', '注册失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  }

  function renderSample({ item }) {
    return (
      <View style={styles.sampleItem}>
        <View style={styles.sampleInfo}>
          <Text style={styles.sampleIndex}>样本 #{item.index}</Text>
          <Text style={styles.sampleTime}>{item.timestamp}</Text>
        </View>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => removeSample(item.id)}
          disabled={isProcessing}
        >
          <Text style={styles.removeButtonText}>删除</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>多采样声纹注册</Text>
      
      <TextInput
        style={styles.input}
        placeholder="邮箱"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      
      <TextInput
        style={styles.input}
        placeholder="姓名"
        value={name}
        onChangeText={setName}
      />

      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          录音进度: {audioSamples.length}/{REQUIRED_SAMPLES}
        </Text>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { width: `${(audioSamples.length / REQUIRED_SAMPLES) * 100}%` }
            ]} 
          />
        </View>
      </View>

      <Text style={styles.label}>请念出口令录制声纹：</Text>
      <Text style={styles.passphrase}>"预定明天下午三点会议室"</Text>
      <Text style={styles.hint}>
        💡 提示：在安静和嘈杂环境下分别录制，提高准确率
      </Text>

      <TouchableOpacity
        style={[styles.recordButton, isRecording && styles.recordingButton]}
        onPress={isRecording ? stopRecording : startRecording}
        disabled={isProcessing || audioSamples.length >= REQUIRED_SAMPLES * 2}
      >
        <Text style={styles.buttonText}>
          {isProcessing ? '处理中...' : 
           isRecording ? '停止录音' : 
           audioSamples.length >= REQUIRED_SAMPLES ? '继续录制(可选)' : '开始录音'}
        </Text>
      </TouchableOpacity>

      {audioSamples.length > 0 && (
        <View style={styles.samplesContainer}>
          <Text style={styles.samplesTitle}>已录制样本:</Text>
          <FlatList
            data={audioSamples}
            renderItem={renderSample}
            keyExtractor={item => item.id}
            style={styles.samplesList}
          />
        </View>
      )}

      <View style={styles.fusionContainer}>
        <Text style={styles.fusionTitle}>融合方法:</Text>
        <View style={styles.fusionOptions}>
          {['mean', 'median', 'weighted', 'pca', 'ensemble'].map(method => (
            <TouchableOpacity
              key={method}
              style={[
                styles.fusionOption,
                fusionMethod === method && styles.fusionOptionSelected
              ]}
              onPress={() => setFusionMethod(method)}
            >
              <Text style={[
                styles.fusionOptionText,
                fusionMethod === method && styles.fusionOptionTextSelected
              ]}>
                {method === 'mean' ? '均值' :
                 method === 'median' ? '中位数' :
                 method === 'weighted' ? '加权' :
                 method === 'pca' ? 'PCA' : '集成'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.registerButton, isProcessing && styles.disabledButton]}
        onPress={handleRegister}
        disabled={isProcessing || audioSamples.length < REQUIRED_SAMPLES}
      >
        <Text style={styles.registerButtonText}>
          {audioSamples.length >= REQUIRED_SAMPLES ? '完成注册' : `还需要 ${REQUIRED_SAMPLES - audioSamples.length} 个样本`}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={styles.loginText}>已有账号？去登录</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  input: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4caf50',
    borderRadius: 4,
  },
  label: {
    fontSize: 16,
    marginBottom: 10,
    color: '#666',
  },
  passphrase: {
    fontSize: 16,
    fontStyle: 'italic',
    padding: 15,
    backgroundColor: '#e3f2fd',
    borderRadius: 10,
    marginBottom: 10,
    textAlign: 'center',
  },
  hint: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 20,
    textAlign: 'center',
  },
  recordButton: {
    backgroundColor: '#2196f3',
    paddingVertical: 15,
    borderRadius: 30,
    marginBottom: 15,
  },
  recordingButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  samplesContainer: {
    marginTop: 10,
    marginBottom: 15,
    maxHeight: 150,
  },
  samplesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  samplesList: {
    flex: 1,
  },
  sampleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sampleInfo: {
    flex: 1,
  },
  sampleIndex: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  sampleTime: {
    fontSize: 12,
    color: '#666',
  },
  removeButton: {
    backgroundColor: '#f44336',
    paddingHorizontal: 15,
    paddingVertical: 6,
    borderRadius: 15,
  },
  removeButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  fusionContainer: {
    marginBottom: 15,
  },
  fusionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  fusionOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fusionOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  fusionOptionSelected: {
    backgroundColor: '#2196f3',
    borderColor: '#2196f3',
  },
  fusionOptionText: {
    fontSize: 14,
    color: '#666',
  },
  fusionOptionTextSelected: {
    color: 'white',
    fontWeight: 'bold',
  },
  registerButton: {
    backgroundColor: '#4caf50',
    paddingVertical: 15,
    borderRadius: 30,
    marginTop: 10,
  },
  disabledButton: {
    opacity: 0.5,
  },
  registerButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  loginText: {
    color: '#2196f3',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
});