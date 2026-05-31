import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Trash2, Plus, Play, Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { webhookApi } from '../services/api';

function WebhookSubscriptionManager() {
  const { id: urlId } = useParams();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedLog, setExpandedLog] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [formData, setFormData] = useState({
    webhookUrl: '',
    name: '',
    secret: '',
    notifyOnChange: true,
    includeDiffSummary: true,
    includeSnapshotLink: true,
  });

  useEffect(() => {
    loadSubscriptions();
  }, [urlId]);

  const loadSubscriptions = async () => {
    try {
      const response = await webhookApi.getByUrlId(urlId);
      setSubscriptions(response.data);
    } catch (error) {
      console.error('Failed to load subscriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await webhookApi.create({
        urlId,
        ...formData,
      });
      setFormData({
        webhookUrl: '',
        name: '',
        secret: '',
        notifyOnChange: true,
        includeDiffSummary: true,
        includeSnapshotLink: true,
      });
      setShowForm(false);
      loadSubscriptions();
    } catch (error) {
      console.error('Failed to create subscription:', error);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('确定要删除这个Webhook订阅吗？')) {
      try {
        await webhookApi.delete(id);
        loadSubscriptions();
      } catch (error) {
        console.error('Failed to delete subscription:', error);
      }
    }
  };

  const handleTest = async (id) => {
    setTestingId(id);
    try {
      const result = await webhookApi.test(id);
      alert(result.success ? '测试成功！' : `测试失败，状态码: ${result.status}`);
      loadSubscriptions();
    } catch (error) {
      alert('测试失败: ' + error.message);
    } finally {
      setTestingId(null);
    }
  };

  const toggleLogs = async (id) => {
    if (expandedLog === id) {
      setExpandedLog(null);
      return;
    }
    setExpandedLog(id);
  };

  if (loading) {
    return <div className="text-center py-12">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Webhook订阅</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          添加订阅
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium mb-4">新建Webhook订阅</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL *</label>
              <input
                type="url"
                value={formData.webhookUrl}
                onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="https://your-webhook-endpoint.com/notify"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="可选的订阅名称"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">签名密钥</label>
              <input
                type="password"
                value={formData.secret}
                onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="用于生成X-Webhook-Signature签名"
              />
              <p className="text-xs text-gray-500 mt-1">
                留空则不启用签名验证。建议设置密钥以验证请求来源。
              </p>
            </div>
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.notifyOnChange}
                  onChange={(e) => setFormData({ ...formData, notifyOnChange: e.target.checked })}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">检测到变更时发送通知</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.includeDiffSummary}
                  onChange={(e) => setFormData({ ...formData, includeDiffSummary: e.target.checked })}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">包含详细差异摘要</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.includeSnapshotLink}
                  onChange={(e) => setFormData({ ...formData, includeSnapshotLink: e.target.checked })}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">包含快照链接</span>
              </label>
            </div>
            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                创建订阅
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {subscriptions.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">暂无Webhook订阅</p>
          <p className="text-sm text-gray-400 mt-1">
            创建订阅后，页面变更时将自动发送通知到您的Webhook端点
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {subscriptions.map((sub) => (
            <div key={sub.id} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center">
                      <h3 className="font-medium text-gray-900">{sub.name || sub.webhook_url}</h3>
                      {sub.last_status === 1 ? (
                        <CheckCircle className="h-4 w-4 text-green-500 ml-2" />
                      ) : sub.last_status === 0 ? (
                        <XCircle className="h-4 w-4 text-red-500 ml-2" />
                      ) : null}
                    </div>
                    <p className="text-sm text-gray-500 mt-1 font-mono break-all">{sub.webhook_url}</p>
                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500">
                      <span className="flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        {sub.last_called_at 
                          ? format(new Date(sub.last_called_at), 'yyyy-MM-dd HH:mm')
                          : '从未调用'}
                      </span>
                      {sub.include_diff_summary === 1 && (
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          包含差异摘要
                        </span>
                      )}
                      {sub.include_snapshot_link === 1 && (
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">
                          包含快照链接
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => handleTest(sub.id)}
                      disabled={testingId === sub.id}
                      className="flex items-center px-3 py-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 text-sm disabled:opacity-50"
                    >
                      <Play className="h-3 w-3 mr-1" />
                      {testingId === sub.id ? '测试中...' : '测试'}
                    </button>
                    <button
                      onClick={() => toggleLogs(sub.id)}
                      className="flex items-center px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
                    >
                      {expandedLog === sub.id ? (
                        <ChevronUp className="h-3 w-3 mr-1" />
                      ) : (
                        <ChevronDown className="h-3 w-3 mr-1" />
                      )}
                      日志
                    </button>
                    <button
                      onClick={() => handleDelete(sub.id)}
                      className="flex items-center px-3 py-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      删除
                    </button>
                  </div>
                </div>
              </div>
              {expandedLog === sub.id && (
                <WebhookLogs subscriptionId={sub.id} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WebhookLogs({ subscriptionId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, [subscriptionId]);

  const loadLogs = async () => {
    try {
      const response = await webhookApi.getLogs(subscriptionId, 20);
      setLogs(response.data);
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 pb-4 text-center text-sm text-gray-500">
        加载日志中...
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="px-4 pb-4 text-center text-sm text-gray-500">
        暂无调用日志
      </div>
    );
  }

  return (
    <div className="border-t bg-gray-50">
      <div className="p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">最近调用日志</h4>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="text-xs bg-white p-3 rounded border">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-500">
                  {format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss')}
                </span>
                <span className={`px-2 py-0.5 rounded ${
                  log.response_status >= 200 && log.response_status < 300
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {log.response_status || '失败'}
                </span>
              </div>
              {log.error_message && (
                <div className="text-red-600 mb-1">错误: {log.error_message}</div>
              )}
              {log.response_body && (
                <div className="text-gray-600 font-mono truncate">
                  响应: {log.response_body}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default WebhookSubscriptionManager;
