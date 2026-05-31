import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking } from 'react-native';
import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

export default function MeetingSummaryScreen({ route, navigation }) {
  const { meeting: initialMeeting } = route.params;
  const [meeting, setMeeting] = useState(initialMeeting);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMeetingDetails();
  }, []);

  async function loadMeetingDetails() {
    try {
      const response = await axios.get(`${API_URL}/meetings/${initialMeeting._id}`);
      setMeeting(response.data);
    } catch (error) {
      console.error('Load meeting details error:', error);
    }
  }

  async function handleResendEmail() {
    setLoading(true);
    try {
      await axios.post(`${API_URL}/meetings/${meeting._id}/resend-email`);
      Alert.alert('成功', '会议纪要已重新发送到所有参会人邮箱');
    } catch (error) {
      Alert.alert('错误', '发送失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  async function toggleTodo(index) {
    try {
      const newStatus = !meeting.summary.todos[index].completed;
      await axios.put(`${API_URL}/meetings/${meeting._id}/todos/${index}`, {
        completed: newStatus,
      });
      
      const updatedTodos = [...meeting.summary.todos];
      updatedTodos[index].completed = newStatus;
      setMeeting({
        ...meeting,
        summary: { ...meeting.summary, todos: updatedTodos }
      });
    } catch (error) {
      Alert.alert('错误', '更新失败');
    }
  }

  if (!meeting.summary) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>会议纪要生成中...</Text>
          <Text style={styles.emptySubtext}>请稍候，系统正在处理会议录音</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{meeting.summary.title || meeting.title}</Text>
        <Text style={styles.subtitle}>
          {new Date(meeting.startTime).toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          })}
        </Text>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>会议时长</Text>
          <Text style={styles.infoValue}>{meeting.summary.duration}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>参会人数</Text>
          <Text style={styles.infoValue}>{meeting.attendees?.length || 0} 人</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>决策数量</Text>
          <Text style={styles.infoValue}>{meeting.summary.decisions?.length || 0} 项</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>待办事项</Text>
          <Text style={styles.infoValue}>
            {meeting.summary.todos?.filter(t => t.completed).length || 0} / {meeting.summary.todos?.length || 0}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📝 会议概述</Text>
        </View>
        <View style={styles.sectionContent}>
          <Text style={styles.overviewText}>{meeting.summary.overview}</Text>
        </View>
      </View>

      {meeting.summary.decisions && meeting.summary.decisions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>✅ 会议决策</Text>
            <Text style={styles.badge}>{meeting.summary.decisions.length}项</Text>
          </View>
          {meeting.summary.decisions.map((decision, index) => (
            <View key={index} style={styles.decisionItem}>
              <View style={styles.decisionIcon}>
                <Text style={styles.decisionNumber}>{index + 1}</Text>
              </View>
              <View style={styles.decisionContent}>
                <Text style={styles.decisionText}>{decision.content}</Text>
                {decision.speaker && (
                  <Text style={styles.decisionSpeaker}>发言人: {decision.speaker}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {meeting.summary.todos && meeting.summary.todos.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📋 待办事项</Text>
            <Text style={styles.badge}>{meeting.summary.todos.filter(t => t.completed).length}/{meeting.summary.todos.length}</Text>
          </View>
          {meeting.summary.todos.map((todo, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.todoItem, todo.completed && styles.todoCompleted]}
              onPress={() => toggleTodo(index)}
            >
              <View style={styles.todoCheckbox}>
                <Text style={[styles.checkboxText, todo.completed && styles.checkboxChecked]}>
                  {todo.completed ? '✓' : '○'}
                </Text>
              </View>
              <View style={styles.todoContent}>
                <Text style={[styles.todoText, todo.completed && styles.todoTextCompleted]}>
                  {todo.task}
                </Text>
                <View style={styles.todoMeta}>
                  {todo.assignee && (
                    <Text style={styles.todoAssignee}>👤 {todo.assignee}</Text>
                  )}
                  {todo.deadline && (
                    <Text style={styles.todoDeadline}>
                      📅 {new Date(todo.deadline).toLocaleDateString('zh-CN')}
                    </Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {meeting.summary.keyPoints && meeting.summary.keyPoints.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>💡 关键要点</Text>
          </View>
          {meeting.summary.keyPoints.map((point, index) => (
            <View key={index} style={styles.keyPointItem}>
              <Text style={styles.keyPointBullet}>•</Text>
              <Text style={styles.keyPointText}>{point}</Text>
            </View>
          ))}
        </View>
      )}

      {meeting.transcription && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📄 会议记录原文</Text>
          </View>
          <View style={styles.transcriptionBox}>
            <Text style={styles.transcriptionText}>{meeting.transcription}</Text>
          </View>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, loading && styles.actionButtonDisabled]}
          onPress={handleResendEmail}
          disabled={loading}
        >
          <Text style={styles.actionButtonText}>
            {loading ? '发送中...' : '📧 重新发送邮件'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          会议纪要由智能会议室系统自动生成
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: 25,
    backgroundColor: '#667eea',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  infoCard: {
    backgroundColor: 'white',
    margin: 15,
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    flexWrap: 'wrap',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoRow: {
    width: '50%',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  section: {
    backgroundColor: 'white',
    marginHorizontal: 15,
    marginBottom: 15,
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  badge: {
    backgroundColor: '#667eea',
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  sectionContent: {
    marginTop: 8,
  },
  overviewText: {
    fontSize: 15,
    color: '#555',
    lineHeight: 24,
  },
  decisionItem: {
    flexDirection: 'row',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  decisionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#27ae60',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  decisionNumber: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  decisionContent: {
    flex: 1,
  },
  decisionText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  decisionSpeaker: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  todoItem: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fafafa',
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f39c12',
  },
  todoCompleted: {
    opacity: 0.6,
    borderLeftColor: '#27ae60',
  },
  todoCheckbox: {
    marginRight: 12,
    marginTop: 2,
  },
  checkboxText: {
    fontSize: 18,
    color: '#ccc',
  },
  checkboxChecked: {
    color: '#27ae60',
  },
  todoContent: {
    flex: 1,
  },
  todoText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  todoTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  todoMeta: {
    flexDirection: 'row',
    marginTop: 6,
  },
  todoAssignee: {
    fontSize: 12,
    color: '#666',
    marginRight: 12,
  },
  todoDeadline: {
    fontSize: 12,
    color: '#666',
  },
  keyPointItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  keyPointBullet: {
    color: '#667eea',
    fontWeight: 'bold',
    marginRight: 8,
    fontSize: 18,
  },
  keyPointText: {
    flex: 1,
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
  },
  transcriptionBox: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
  },
  transcriptionText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
  actions: {
    padding: 15,
  },
  actionButton: {
    backgroundColor: '#667eea',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});