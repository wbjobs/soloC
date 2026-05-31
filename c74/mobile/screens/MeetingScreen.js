import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert, TextInput } from 'react-native';
import { Audio } from 'expo-av';
import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

export default function MeetingScreen({ route, navigation }) {
  const { user } = route.params;
  const [meetings, setMeetings] = useState([]);
  const [activeMeeting, setActiveMeeting] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMeeting, setNewMeeting] = useState({ title: '', roomId: '' });
  
  const recordingRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    loadMeetings();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function loadMeetings() {
    try {
      const response = await axios.get(`${API_URL}/meetings?userId=${user._id}`);
      setMeetings(response.data);
    } catch (error) {
      console.error('Load meetings error:', error);
    }
  }

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
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
    } catch (err) {
      Alert.alert('错误', '无法启动录音');
    }
  }

  async function stopRecording() {
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      
      const base64Audio = await fetch(uri).then(res => res.text());
      
      return base64Audio;
    } catch (err) {
      Alert.alert('错误', '录音保存失败');
      return null;
    }
  }

  async function handleStartMeeting(meeting) {
    try {
      await axios.post(`${API_URL}/meetings/${meeting._id}/start`);
      setActiveMeeting(meeting);
      await startRecording();
      loadMeetings();
    } catch (error) {
      Alert.alert('错误', '无法开始会议');
    }
  }

  async function handleEndMeeting() {
    if (!activeMeeting) return;
    
    const audioData = await stopRecording();
    
    try {
      Alert.alert('处理中', '正在处理会议录音和生成纪要...');
      
      await axios.post(`${API_URL}/meetings/${activeMeeting._id}/end`, {
        audio: audioData,
      });
      
      Alert.alert(
        '会议结束',
        '会议录音已处理，会议纪要将发送到所有参会人邮箱。'
      );
      
      setActiveMeeting(null);
      loadMeetings();
    } catch (error) {
      Alert.alert('错误', '会议处理失败');
    }
  }

  async function handleCreateMeeting() {
    if (!newMeeting.title) {
      Alert.alert('提示', '请输入会议标题');
      return;
    }

    try {
      const now = new Date();
      const endTime = new Date(now.getTime() + 60 * 60 * 1000);

      await axios.post(`${API_URL}/meetings`, {
        ...newMeeting,
        bookingId: 'temp_' + Date.now(),
        roomId: newMeeting.roomId || 'default',
        organizerId: user._id,
        attendees: [{ userId: user._id, name: user.name, email: user.email }],
        startTime: now.toISOString(),
        endTime: endTime.toISOString(),
      });

      setShowCreateModal(false);
      setNewMeeting({ title: '', roomId: '' });
      loadMeetings();
      Alert.alert('成功', '会议已创建');
    } catch (error) {
      Alert.alert('错误', '创建会议失败');
    }
  }

  async function handleViewSummary(meeting) {
    navigation.navigate('MeetingSummary', { meeting });
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function getStatusColor(status) {
    switch (status) {
      case 'scheduled': return '#3498db';
      case 'recording': return '#e74c3c';
      case 'processing': return '#f39c12';
      case 'completed': return '#27ae60';
      case 'cancelled': return '#95a5a6';
      default: return '#666';
    }
  }

  function getStatusText(status) {
    switch (status) {
      case 'scheduled': return '待开始';
      case 'recording': return '进行中';
      case 'processing': return '处理中';
      case 'completed': return '已完成';
      case 'cancelled': return '已取消';
      default: return status;
    }
  }

  function renderMeetingItem({ item }) {
    return (
      <View style={styles.meetingCard}>
        <View style={styles.meetingHeader}>
          <Text style={styles.meetingTitle}>{item.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
          </View>
        </View>
        
        <View style={styles.meetingInfo}>
          <Text style={styles.meetingTime}>
            📅 {new Date(item.startTime).toLocaleString('zh-CN')}
          </Text>
          <Text style={styles.meetingAttendees}>
            👥 {item.attendees?.length || 0} 人参会
          </Text>
        </View>

        <View style={styles.meetingActions}>
          {item.status === 'scheduled' && (
            <TouchableOpacity
              style={styles.actionButtonPrimary}
              onPress={() => handleStartMeeting(item)}
            >
              <Text style={styles.actionButtonText}>开始会议</Text>
            </TouchableOpacity>
          )}
          
          {item.status === 'completed' && item.summary && (
            <TouchableOpacity
              style={styles.actionButtonSecondary}
              onPress={() => handleViewSummary(item)}
            >
              <Text style={styles.actionButtonTextSecondary}>查看纪要</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>我的会议</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Text style={styles.createButtonText}>+ 创建会议</Text>
        </TouchableOpacity>
      </View>

      {activeMeeting && (
        <View style={styles.activeMeetingBanner}>
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>正在录音</Text>
          </View>
          <Text style={styles.recordingTime}>{formatTime(recordingTime)}</Text>
          <TouchableOpacity
            style={styles.endMeetingButton}
            onPress={handleEndMeeting}
          >
            <Text style={styles.endMeetingText}>结束会议</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={meetings}
        renderItem={renderMeetingItem}
        keyExtractor={item => item._id}
        style={styles.meetingList}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>暂无会议记录</Text>
            <Text style={styles.emptySubtext}>点击上方按钮创建新会议</Text>
          </View>
        }
      />

      {showCreateModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>创建新会议</Text>
            
            <TextInput
              style={styles.input}
              placeholder="会议标题"
              value={newMeeting.title}
              onChangeText={text => setNewMeeting({ ...newMeeting, title: text })}
            />
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.cancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleCreateMeeting}
              >
                <Text style={styles.confirmButtonText}>创建</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  createButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  activeMeetingBanner: {
    backgroundColor: '#e74c3c',
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'white',
    marginRight: 8,
  },
  recordingText: {
    color: 'white',
    fontWeight: 'bold',
  },
  recordingTime: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  endMeetingButton: {
    backgroundColor: 'white',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  endMeetingText: {
    color: '#e74c3c',
    fontWeight: 'bold',
  },
  meetingList: {
    flex: 1,
    padding: 20,
  },
  meetingCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  meetingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  meetingTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  meetingInfo: {
    marginBottom: 15,
  },
  meetingTime: {
    color: '#666',
    marginBottom: 4,
  },
  meetingAttendees: {
    color: '#666',
  },
  meetingActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButtonPrimary: {
    backgroundColor: '#667eea',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionButtonSecondary: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  actionButtonTextSecondary: {
    color: '#667eea',
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#bbb',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: 'bold',
  },
  confirmButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  confirmButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});