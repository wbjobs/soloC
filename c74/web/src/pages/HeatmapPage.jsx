import React, { useEffect, useRef, useState } from 'react';
import h337 from 'heatmap.js';
import { fetchHeatmapData, fetchRooms } from '../services/api';

export default function HeatmapPage() {
  const heatmapRef = useRef(null);
  const heatmapInstance = useRef(null);
  const [rooms, setRooms] = useState([]);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadRooms();
  }, []);

  useEffect(() => {
    if (heatmapRef.current && !heatmapInstance.current) {
      heatmapInstance.current = h337.create({
        container: heatmapRef.current,
        radius: 50,
        maxOpacity: 0.6,
        minOpacity: 0.1,
        blur: 0.75,
      });
    }
    loadHeatmapData();
  }, [dateRange]);

  async function loadRooms() {
    const data = await fetchRooms();
    setRooms(data);
  }

  async function loadHeatmapData() {
    if (!heatmapInstance.current) return;

    const data = await fetchHeatmapData(dateRange.start, dateRange.end);
    
    const points = [];
    const roomWidth = 200;
    const roomHeight = 100;
    
    Object.entries(data).forEach(([key, value]) => {
      const [roomName, hour] = key.split('-');
      const roomIndex = rooms.findIndex(r => r.name === roomName);
      
      if (roomIndex >= 0) {
        const x = 100 + (parseInt(hour) - 8) * 80;
        const y = 100 + roomIndex * (roomHeight + 30);
        
        if (x > 0 && x < 800 && y > 0 && y < 500) {
          points.push({
            x,
            y,
            value: value * 10,
          });
        }
      }
    });

    heatmapInstance.current.setData({
      max: 50,
      data: points,
    });
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-800">会议室预订热力图</h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">图例说明</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded" style={{ background: 'rgba(0, 255, 255, 0.6)' }}></div>
                <span>低频</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded" style={{ background: 'rgba(0, 255, 0, 0.6)' }}></div>
                <span>中低频</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded" style={{ background: 'rgba(255, 255, 0, 0.6)' }}></div>
                <span>中频</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded" style={{ background: 'rgba(255, 0, 0, 0.6)' }}></div>
                <span>高频</span>
              </div>
            </div>
          </div>

          <div 
            ref={heatmapRef} 
            className="relative bg-gray-50 rounded-lg border border-gray-200"
            style={{ height: '500px', width: '100%' }}
          >
            <div className="absolute top-2 left-20 text-sm text-gray-600">
              <span className="inline-block w-20 text-center">8:00</span>
              <span className="inline-block w-20 text-center">10:00</span>
              <span className="inline-block w-20 text-center">12:00</span>
              <span className="inline-block w-20 text-center">14:00</span>
              <span className="inline-block w-20 text-center">16:00</span>
              <span className="inline-block w-20 text-center">18:00</span>
            </div>
            
            {rooms.map((room, index) => (
              <div 
                key={room._id}
                className="absolute left-2 text-sm font-medium text-gray-700"
                style={{ top: `${130 + index * 130}px` }}
              >
                {room.name}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">会议室信息</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {rooms.map((room) => (
              <div key={room._id} className="border rounded-lg p-4">
                <h4 className="font-bold text-lg">{room.name}</h4>
                <p className="text-gray-600">容量：{room.capacity}人</p>
                <p className="text-gray-600">位置：{room.location}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}