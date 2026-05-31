import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

const BandPowerChart = ({ bandPowers }) => {
  const data = [
    { name: 'Delta', value: bandPowers?.delta || 0, color: '#000080' },
    { name: 'Theta', value: bandPowers?.theta || 0, color: '#4B0082' },
    { name: 'Alpha', value: bandPowers?.alpha || 0, color: '#00CED1' },
    { name: 'Beta', value: bandPowers?.beta || 0, color: '#32CD32' },
    { name: 'Gamma', value: bandPowers?.gamma || 0, color: '#FFD700' },
  ];

  return (
    <div className="bg-white rounded-lg p-4 shadow-md">
      <h3 className="text-lg font-semibold mb-3">频带功率</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Area type="monotone" dataKey="value" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const AttentionGauge = ({ score }) => {
  const getColor = (s) => {
    if (s < 30) return '#ef4444';
    if (s < 60) return '#f59e0b';
    return '#22c55e';
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow-md">
      <h3 className="text-lg font-semibold mb-3">注意力评分</h3>
      <div className="flex flex-col items-center">
        <div 
          className="text-6xl font-bold mb-2"
          style={{ color: getColor(score) }}
        >
          {Math.round(score)}
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div 
            className="h-4 rounded-full transition-all duration-300"
            style={{ 
              width: `${score}%`,
              backgroundColor: getColor(score)
            }}
          />
        </div>
        <div className="flex justify-between w-full mt-1 text-sm text-gray-500">
          <span>低</span>
          <span>中</span>
          <span>高</span>
        </div>
      </div>
    </div>
  );
};

const GroupSyncRadar = ({ syncMetrics }) => {
  if (!syncMetrics || !syncMetrics.plv_values) {
    return null;
  }

  const data = [
    { subject: 'Delta', value: (syncMetrics.plv_values.delta || 0) * 100 },
    { subject: 'Theta', value: (syncMetrics.plv_values.theta || 0) * 100 },
    { subject: 'Alpha', value: (syncMetrics.plv_values.alpha || 0) * 100 },
    { subject: 'Beta', value: (syncMetrics.plv_values.beta || 0) * 100 },
    { subject: 'Gamma', value: (syncMetrics.plv_values.gamma || 0) * 100 },
    { subject: 'Global', value: (syncMetrics.plv_values.global || 0) * 100 },
  ];

  return (
    <div className="bg-white rounded-lg p-4 shadow-md">
      <h3 className="text-lg font-semibold mb-3">群体同步性 (PLV)</h3>
      <ResponsiveContainer width="100%" height={250}>
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="subject" />
          <PolarRadiusAxis angle={30} domain={[0, 100]} />
          <Radar name="PLV" dataKey="value" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

const AttentionDistributionChart = ({ syncMetrics }) => {
  if (!syncMetrics || !syncMetrics.attention_distribution?.distribution) {
    return null;
  }

  const data = syncMetrics.attention_distribution.distribution.map((item, idx) => ({
    name: item.participant || `参与者${idx + 1}`,
    注意力: item.score,
    平均水平: syncMetrics.attention_distribution.mean || 50
  }));

  return (
    <div className="bg-white rounded-lg p-4 shadow-md">
      <h3 className="text-lg font-semibold mb-3">群体注意力分布</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis domain={[0, 100]} />
          <Tooltip />
          <Line type="monotone" dataKey="注意力" stroke="#8884d8" strokeWidth={2} />
          <Line type="monotone" dataKey="平均水平" stroke="#82ca9d" strokeDasharray="5 5" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const RawEEGChart = ({ rawData }) => {
  return (
    <div className="bg-white rounded-lg p-4 shadow-md">
      <h3 className="text-lg font-semibold mb-3">原始EEG波形</h3>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={rawData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" hide />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="ch1" stroke="#ef4444" dot={false} strokeWidth={1} />
          <Line type="monotone" dataKey="ch2" stroke="#3b82f6" dot={false} strokeWidth={1} />
          <Line type="monotone" dataKey="ch3" stroke="#22c55e" dot={false} strokeWidth={1} />
          <Line type="monotone" dataKey="ch4" stroke="#f59e0b" dot={false} strokeWidth={1} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const EEGMonitor = ({ bandPowers, attentionScore, rawData, syncMetrics }) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AttentionGauge score={attentionScore} />
        <BandPowerChart bandPowers={bandPowers} />
      </div>
      
      <RawEEGChart rawData={rawData} />
      
      {syncMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GroupSyncRadar syncMetrics={syncMetrics} />
          <AttentionDistributionChart syncMetrics={syncMetrics} />
        </div>
      )}
    </div>
  );
};

export default EEGMonitor;
