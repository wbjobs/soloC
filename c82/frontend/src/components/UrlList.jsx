import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Play, Eye, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { urlApi } from '../services/api';

function UrlList() {
  const [urls, setUrls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newUrl, setNewUrl] = useState({ url: '', name: '' });

  useEffect(() => {
    loadUrls();
  }, []);

  const loadUrls = async () => {
    try {
      const response = await urlApi.getAll();
      setUrls(response.data);
    } catch (error) {
      console.error('Failed to load URLs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await urlApi.create(newUrl);
      setNewUrl({ url: '', name: '' });
      setShowForm(false);
      loadUrls();
    } catch (error) {
      console.error('Failed to create URL:', error);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('确定要删除这个URL吗？')) {
      try {
        await urlApi.delete(id);
        loadUrls();
      } catch (error) {
        console.error('Failed to delete URL:', error);
      }
    }
  };

  const handleCrawl = async (id) => {
    try {
      await urlApi.crawl(id);
      alert('抓取完成');
    } catch (error) {
      console.error('Failed to crawl:', error);
      alert('抓取失败');
    }
  };

  if (loading) {
    return <div className="text-center py-12">加载中...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">监控URL列表</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-5 w-5 mr-2" />
          添加URL
        </button>
      </div>

      {showForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium mb-4">添加新URL</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
              <input
                type="url"
                value={newUrl.url}
                onChange={(e) => setNewUrl({ ...newUrl, url: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="https://example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名称（可选）</label>
              <input
                type="text"
                value={newUrl.name}
                onChange={(e) => setNewUrl({ ...newUrl, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Example Website"
              />
            </div>
            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                保存
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

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">URL</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {urls.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                  暂无URL，请添加
                </td>
              </tr>
            ) : (
              urls.map((url) => (
                <tr key={url.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{url.name || url.url}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <a
                      href={url.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      {url.url.substring(0, 50)}...
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(url.created_at), 'yyyy-MM-dd HH:mm')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      url.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {url.is_active ? '活跃' : '已停用'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      to={`/url/${url.id}`}
                      className="text-blue-600 hover:text-blue-900 mr-3 inline-flex items-center"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      查看
                    </Link>
                    <button
                      onClick={() => handleCrawl(url.id)}
                      className="text-green-600 hover:text-green-900 mr-3 inline-flex items-center"
                    >
                      <Play className="h-4 w-4 mr-1" />
                      抓取
                    </button>
                    <button
                      onClick={() => handleDelete(url.id)}
                      className="text-red-600 hover:text-red-900 inline-flex items-center"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      删除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default UrlList;
