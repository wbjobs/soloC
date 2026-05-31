import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Play, BarChart3, GitCompare, Clock, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { urlApi } from '../services/api';

function UrlDetail() {
  const { id } = useParams();
  const [url, setUrl] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [diffs, setDiffs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('date');
  const [dateFilter, setDateFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [urlRes, snapshotsRes, diffsRes, statsRes] = await Promise.all([
        urlApi.getById(id),
        urlApi.getSnapshots(id),
        urlApi.getDiffs(id),
        urlApi.getStats(id),
      ]);
      setUrl(urlRes.data);
      setSnapshots(snapshotsRes.data);
      setDiffs(diffsRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCrawl = async () => {
    try {
      await urlApi.crawl(id);
      alert('抓取完成');
      loadData();
    } catch (error) {
      console.error('Failed to crawl:', error);
      alert('抓取失败');
    }
  };

  const getFilteredDiffs = () => {
    let filtered = [...diffs];
    
    if (dateFilter !== 'all') {
      const days = parseInt(dateFilter);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      filtered = filtered.filter(d => new Date(d.created_at) >= cutoff);
    }
    
    if (sortBy === 'changes') {
      filtered.sort((a, b) => b.changed_nodes - a.changed_nodes);
    } else if (sortBy === 'added') {
      filtered.sort((a, b) => b.added_text - a.added_text);
    } else if (sortBy === 'removed') {
      filtered.sort((a, b) => b.removed_text - a.removed_text);
    }
    
    return filtered;
  };

  const chartData = getFilteredDiffs().slice(0, 20).reverse().map(d => ({
    date: format(new Date(d.created_at), 'MM-dd HH:mm'),
    changedNodes: d.changed_nodes,
    addedText: d.added_text,
    removedText: d.removed_text,
  }));

  if (loading) {
    return <div className="text-center py-12">加载中...</div>;
  }

  const filteredDiffs = getFilteredDiffs();

  return (
    <div>
      <div className="flex items-center mb-6">
        <Link to="/" className="flex items-center text-gray-600 hover:text-blue-600 mr-4">
          <ArrowLeft className="h-5 w-5 mr-1" />
          返回
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{url?.name || url?.url}</h1>
        <button
          onClick={handleCrawl}
          className="ml-4 flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Play className="h-4 w-4 mr-2" />
          立即抓取
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="text-sm text-gray-500 mb-2">URL</div>
        <a
          href={url?.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 break-all"
        >
          {url?.url}
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <BarChart3 className="h-8 w-8 text-blue-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-gray-900">{stats?.total_diffs || 0}</div>
            <div className="text-sm text-gray-500">变更次数</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <GitCompare className="h-8 w-8 text-purple-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-gray-900">{stats?.total_changed_nodes || 0}</div>
            <div className="text-sm text-gray-500">变更节点数</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <TrendingUp className="h-8 w-8 text-green-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-gray-900">{stats?.total_added_text || 0}</div>
            <div className="text-sm text-gray-500">新增文本量</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-red-500" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-gray-900">{stats?.last_change ? format(new Date(stats.last_change), 'MM-dd HH:mm') : '-'}</div>
            <div className="text-sm text-gray-500">最近变更</div>
          </div>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">变更趋势</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="changedNodes" stroke="#8884d8" name="变更节点" />
                <Line type="monotone" dataKey="addedText" stroke="#82ca9d" name="新增文本" />
                <Line type="monotone" dataKey="removedText" stroke="#ff7675" name="删除文本" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">变更历史</h3>
          <div className="flex space-x-4">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">全部时间</option>
              <option value="7">最近7天</option>
              <option value="30">最近30天</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="date">按时间排序</option>
              <option value="changes">按变更节点排序</option>
              <option value="added">按新增文本排序</option>
              <option value="removed">按删除文本排序</option>
            </select>
          </div>
        </div>

        {filteredDiffs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">暂无变更记录</div>
        ) : (
          <div className="space-y-4">
            {filteredDiffs.map((diff) => (
              <Link
                key={diff.id}
                to={`/diff/${id}/${diff.id}`}
                className="block p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-sm transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {format(new Date(diff.created_at), 'yyyy-MM-dd HH:mm:ss')}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      快照 {diff.snapshot_from_id.substring(0, 8)} → {diff.snapshot_to_id.substring(0, 8)}
                    </div>
                  </div>
                  <div className="flex space-x-4 text-sm">
                    <div className="text-center">
                      <div className="font-bold text-purple-600">{diff.changed_nodes}</div>
                      <div className="text-gray-500">变更节点</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-green-600">{diff.added_text}</div>
                      <div className="text-gray-500">新增文本</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-red-600">{diff.removed_text}</div>
                      <div className="text-gray-500">删除文本</div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default UrlDetail;
