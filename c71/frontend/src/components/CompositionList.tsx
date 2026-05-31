import React from 'react';
import { Composition } from '../types';
import { downloadMidi, deleteComposition } from '../services/api';

interface CompositionListProps {
  compositions: Composition[];
  onDelete: () => void;
}

const CompositionList: React.FC<CompositionListProps> = ({ compositions, onDelete }) => {
  const styleLabels: { [key: string]: string } = {
    pop: '流行',
    jazz: '爵士',
    classical: '古典',
  };

  const handleDownload = async (id: number, type: 'accompaniment' | 'melody') => {
    await downloadMidi(id, type);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('确定要删除这个作品吗？')) {
      await deleteComposition(id);
      onDelete();
    }
  };

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4">历史作品</h3>
      {compositions.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          暂无历史作品
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {compositions.map((comp) => (
            <div
              key={comp.id}
              className="p-4 rounded-lg bg-gray-800/50 border border-gray-700 flex items-center justify-between"
            >
              <div>
                <div className="font-semibold">{comp.title}</div>
                <div className="text-sm text-gray-400">
                  {styleLabels[comp.style] || comp.style} · {new Date(comp.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDownload(comp.id, 'melody')}
                  className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm transition-colors"
                >
                  下载旋律
                </button>
                <button
                  onClick={() => handleDownload(comp.id, 'accompaniment')}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-sm transition-colors"
                >
                  下载伴奏
                </button>
                <button
                  onClick={() => handleDelete(comp.id)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CompositionList;
