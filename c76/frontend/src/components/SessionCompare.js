import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const SessionCompare = () => {
  const [sessions, setSessions] = useState([]);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [compareData, setCompareData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await axios.get('/api/sessions/');
      setSessions(response.data);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  const handleSessionSelect = (sessionId) => {
    setSelectedSessions(prev => {
      if (prev.includes(sessionId)) {
        return prev.filter(id => id !== sessionId);
      } else if (prev.length < 4) {
        return [...prev, sessionId];
      }
      return prev;
    });
  };

  const compareSessions = async () => {
    if (selectedSessions.length < 2) return;

    setLoading(true);
    try {
      const response = await axios.get('/api/session-compare/', {
        params: { ids: selectedSessions }
      });
      setCompareData(response.data);
    } catch (error) {
      console.error('Failed to compare sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatChartData = () => {
    if (!compareData || compareData.length === 0) return [];

    const maxPoints = 100;
    const result = [];

    for (let i = 0; i < maxPoints; i++) {
      const point = { time: i };
      compareData.forEach((session, idx) => {
        if (session.data && session.data[i]) {
          point[`session_${idx + 1}`] = session.data[i].attention_score;
        }
      });
      result.push(point);
    }

    return result;
  };

  const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042'];

  return (
    <div className="bg-white rounded-lg p-4 shadow-md">
      <h3 className="text-lg font-semibold mb-4">📊 历史会话对比</h3>

      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">选择会话 (最多4个):</h4>
        <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
          {sessions.map(session => (
            <label
              key={session.id}
              className="flex items-center p-2 hover:bg-gray-50 cursor-pointer rounded"
            >
              <input
                type="checkbox"
                checked={selectedSessions.includes(session.id)}
                onChange={() => handleSessionSelect(session.id)}
                className="mr-2"
              />
              <span className="text-sm flex-1">{session.name}</span>
              <span className="text-xs text-gray-500">
                {session.duration ? `${session.duration.toFixed(1)}s` : 'N/A'}
              </span>
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={compareSessions}
        disabled={selectedSessions.length < 2 || loading}
        className="w-full mb-4 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {loading ? '加载中...' : '对比选中会话'}
      </button>

      {compareData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {compareData.map((session, idx) => (
              <div
                key={session.session_id}
                className="p-3 rounded-lg border-2"
                style={{ borderColor: colors[idx] }}
              >
                <p className="text-sm font-medium truncate">{session.name}</p>
                <p className="text-lg font-bold" style={{ color: colors[idx] }}>
                  {session.average_attention?.toFixed(1) || 0}
                </p>
                <p className="text-xs text-gray-500">平均注意力</p>
              </div>
            ))}
          </div>

          <div className="h-64">
            <h4 className="text-sm font-medium mb-2">注意力曲线对比</h4>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={formatChartData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" hide />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                {compareData.map((session, idx) => (
                  <Line
                    key={session.session_id}
                    type="monotone"
                    dataKey={`session_${idx + 1}`}
                    name={session.name}
                    stroke={colors[idx]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionCompare;
