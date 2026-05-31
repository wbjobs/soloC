import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert } from 'react-native';
import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

export default function BookingScreen({ route, navigation }) {
  const { user } = route.params;
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    loadRooms();
    loadBookings();
  }, []);

  async function loadRooms() {
    try {
      const response = await axios.get(`${API_URL}/rooms`);
      setRooms(response.data);
    } catch (err) {
      Alert.alert('错误', '加载会议室失败');
    }
  }

  async function loadBookings() {
    try {
      const response = await axios.get(`${API_URL}/bookings?userId=${user._id}`);
      setBookings(response.data);
    } catch (err) {
      Alert.alert('错误', '加载预订记录失败');
    }
  }

  function parseCommand(text) {
    const timeMap = {
      '一点': 1, '两点': 2, '三点': 3, '四点': 4, '五点': 5,
      '六点': 6, '七点': 7, '八点': 8, '九点': 9, '十点': 10,
      '十一点': 11, '十二点': 12,
      '一号': 1, '二号': 2, '三号': 3, '四号': 4, '五号': 5,
      '明天': 1, '后天': 2
    };

    let room = 1;
    let dayOffset = 1;
    let hour = 15;

    for (const [key, value] of Object.entries(timeMap)) {
      if (text.includes(key)) {
        if (key.includes('号') || key.includes('会议室')) {
          room = value;
        } else if (key.includes('天')) {
          dayOffset = value;
        } else if (key.includes('点')) {
          hour = value;
        }
      }
    }

    if (text.includes('下午') || text.includes('pm')) {
      if (hour < 12) hour += 12;
    }

    return { room, dayOffset, hour };
  }

  async function createBooking() {
    const command = "预定明天下午三点会议室";
    const { room, dayOffset, hour } = parseCommand(command);

    const today = new Date();
    const bookingDate = new Date(today);
    bookingDate.setDate(today.getDate() + dayOffset);
    bookingDate.setHours(hour, 0, 0, 0);

    const endTime = new Date(bookingDate);
    endTime.setHours(hour + 1);

    try {
      await axios.post(`${API_URL}/bookings`, {
        userId: user._id,
        roomId: rooms[room - 1]?._id || rooms[0]?._id,
        startTime: bookingDate.toISOString(),
        endTime: endTime.toISOString(),
      });

      Alert.alert('成功', '会议室预订成功！确认邮件已发送');
      loadBookings();
    } catch (err) {
      if (err.response?.status === 409) {
        Alert.alert('提示', '该时间段会议室已被预订');
      } else {
        Alert.alert('错误', '预订失败');
      }
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.welcome}>欢迎，{user.name}！</Text>

      <TouchableOpacity 
        style={styles.meetingButton} 
        onPress={() => navigation.navigate('Meeting', { user })}
      >
        <Text style={styles.meetingButtonText}>🎙️ 智能会议纪要</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.quickBookButton} onPress={createBooking}>
        <Text style={styles.quickBookText}>快速预订明天下午3点会议室</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>我的预订</Text>
      
      <FlatList
        data={bookings}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <View style={styles.bookingItem}>
            <Text style={styles.roomName}>{item.roomId?.name || '会议室'}</Text>
            <Text style={styles.bookingTime}>
              {new Date(item.startTime).toLocaleString('zh-CN')}
            </Text>
            <Text style={[styles.status, item.isVerified ? styles.verified : styles.pending]}>
              {item.isVerified ? '✓ 已验证' : '待验证'}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>暂无预订记录</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  welcome: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  meetingButton: {
    backgroundColor: '#667eea',
    padding: 20,
    borderRadius: 15,
    marginBottom: 15,
  },
  meetingButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  quickBookButton: {
    backgroundColor: '#4caf50',
    padding: 20,
    borderRadius: 15,
    marginBottom: 30,
  },
  quickBookText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  bookingItem: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  roomName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  bookingTime: {
    color: '#666',
    marginBottom: 5,
  },
  status: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  verified: {
    color: '#4caf50',
  },
  pending: {
    color: '#ff9800',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 50,
  },
});