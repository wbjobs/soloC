import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Audio } from 'expo-av';
import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

export default function VoiceLoginScreen({ navigation }) {
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
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
      setRecording(recording);
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
      
      const response = await axios.post(`${API_URL}/users/login`, {
        audio: base64Audio
      });

      if (response.data.success) {
        Alert.alert('成功', '声纹验证通过！');
        navigation.navigate('Booking', { user: response.data.user });
      }
    } catch (err) {
      Alert.alert('错误', '声纹验证失败，请重试');
    } finally {
      setIsProcessing(false);
      setRecording(null);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>会议室预订系统</Text>
      <Text style={styles.subtitle}>念出口令进行声纹登录</Text>
      <Text style={styles.passphrase}>\"预定明天下午三点会议室\"</Text>
      
      <TouchableOpacity
        style={[styles.button, isRecording && styles.recordingButton]}
        onPress={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
      >
        <Text style={styles.buttonText}>
          {isProcessing ? '处理中...' : isRecording ? '停止录音' : '开始录音'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.registerButton}
        onPress={() => navigation.navigate('Register')}
      >
        <Text style={styles.registerText}>还没有账号？去注册</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
  },
  passphrase: {
    fontSize: 18,
    fontStyle: 'italic',
    padding: 20,
    backgroundColor: '#e3f2fd',
    borderRadius: 10,
    marginBottom: 40,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2196f3',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
    marginBottom: 20,
  },
  recordingButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  registerButton: {
    marginTop: 20,
  },
  registerText: {
    color: '#2196f3',
    fontSize: 16,
  },
});