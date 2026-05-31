import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, GitCompare, FileText, Code, PlayCircle } from 'lucide-react';
import { format } from 'date-fns';
import { diffApi } from '../services/api';

function DiffViewer() {
  const { urlId, diffId } = useParams();
  const [diff, setDiff] = useState(null);
  const [diffData, setDiffData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('text');

  useEffect(() => {
    loadDiff();
  }, [diffId]);

  const loadDiff = async () => {
    try {
      const [diffRes, dataRes] = await Promise.all([
        diffApi.getById(diffId),
        diffApi.getData(diffId),
      ]);
      setDiff(diffRes.data);
      setDiffData(dataRes.data);
    } catch (error) {
      console.error('Failed to load diff:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">加载中...</div>;
  }

  const textDiffs = diffData?.filter(d => d.type === 'text') || [];
  const attrDiffs = diffData?.filter(d => d.type === 'attribute') || [];

  const renderTextDiff = () => {
    let addedText = '';
    let removedText = '';

    textDiffs.forEach(d => {
      if (d.action === 'added') {
        addedText += d.value;
      } else {
        removedText += d.value;
      }
    });

    return (
      <div className="space-y-4">
        {removedText && (
          <div>
            <div className="text-sm font-medium text-red-600 mb-2">删除的文本</div>
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <span className="diff-removed">{removedText}</span>
            </div>
          </div>
        )}
        {addedText && (
          <div>
            <div className="text-sm font-medium text-green-600 mb-2">新增的文本</div>
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <span className="diff-added">{addedText}</span>
            </div>
          </div>
        )}
        {!removedText && !addedText && (
          <div className="text-center py-8 text-gray-500">无文本变更</div>
        )}
      </div>
    );
  };

  const renderAttrDiff = () => {
    if (attrDiffs.length === 0) {
      return <div className="text-center py-8 text-gray-500">无属性变更</div>;
    }

    return (
      <div className="space-y-2">
        {attrDiffs.map((attr, index) => (
          <div key={index} className="diff-attribute">
            <span className="diff-path">{attr.path}</span>
            <span className={`diff-action ${attr.action}`}>{attr.action}</span>
            <span className="diff-attr-name">{attr.attribute}</span>
            {attr.oldValue && <span className="diff-old">"{attr.oldValue}"</span>}
            {attr.oldValue && attr.newValue && ' → '}
            {attr.newValue && <span className="diff-new">"{attr.newValue}"</span>}
            {attr.value && <span className={attr.action === 'added' ? 'diff-added' : 'diff-removed'}>"{attr.value}"</span>}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center mb-6">
        <Link to={`/url/${urlId}`} className="flex items-center text-gray-600 hover:text-blue-600 mr-4">
          <ArrowLeft className="h-5 w-5 mr-1" />
          返回
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mr-4">变更详情</h1>
        <Link
          to={`/replay/${urlId}/${diffId}`}
          className="flex items-center px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium"
        >
          <PlayCircle className="h-4 w-4 mr-1.5" />
          播放变更动画
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <div className="text-sm text-gray-500 mb-1">变更时间</div>
            <div className="text-lg font-medium">
              {diff ? format(new Date(diff.created_at), 'yyyy-MM-dd HH:mm:ss') : '-'}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">快照版本</div>
            <div className="text-lg font-medium">
              {diff ? `${diff.snapshot_from_id.substring(0, 8)} → ${diff.snapshot_to_id.substring(0, 8)}` : '-'}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">变更节点数</div>
            <div className="text-lg font-medium text-purple-600">{diff?.changed_nodes || 0}</div>
          </div>
          <div className="flex space-x-4">
            <div>
              <div className="text-sm text-gray-500 mb-1">新增文本</div>
              <div className="text-lg font-medium text-green-600">{diff?.added_text || 0}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">删除文本</div>
              <div className="text-lg font-medium text-red-600">{diff?.removed_text || 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('text')}
              className={`flex items-center px-6 py-4 text-sm font-medium border-b-2 ${
                activeTab === 'text'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FileText className="h-4 w-4 mr-2" />
              文本变更 ({textDiffs.length})
            </button>
            <button
              onClick={() => setActiveTab('attr')}
              className={`flex items-center px-6 py-4 text-sm font-medium border-b-2 ${
                activeTab === 'attr'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Code className="h-4 w-4 mr-2" />
              属性变更 ({attrDiffs.length})
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'text' && renderTextDiff()}
          {activeTab === 'attr' && renderAttrDiff()}
        </div>
      </div>
    </div>
  );
}

export default DiffViewer;
