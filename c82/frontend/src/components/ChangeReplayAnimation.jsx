import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Play, Pause, SkipForward, SkipBack, RefreshCw, ChevronRight, AlertCircle } from 'lucide-react';
import { diffApi } from '../services/api';

function ChangeReplayAnimation() {
  const { id: urlId, diffId } = useParams();
  const [diffData, setDiffData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState(1500);
  const animationRef = useRef(null);

  useEffect(() => {
    loadDiffData();
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, [diffId]);

  const loadDiffData = async () => {
    try {
      const response = await diffApi.getData(diffId);
      const data = response.data || [];
      const processed = data.map((item, index) => ({
        ...item,
        id: `${item.type}-${index}`,
        visible: false,
        animating: false,
      }));
      setDiffData(processed);
    } catch (error) {
      console.error('Failed to load diff data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPlaying && currentStep < diffData.length) {
      animationRef.current = setTimeout(() => {
        showStep(currentStep);
        setCurrentStep(prev => prev + 1);
      }, animationSpeed);
    } else if (currentStep >= diffData.length) {
      setIsPlaying(false);
    }

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, [isPlaying, currentStep, diffData.length, animationSpeed]);

  const showStep = (index) => {
    if (index >= 0 && index < diffData.length) {
      setDiffData(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], animating: true };
        setTimeout(() => {
          setDiffData(p => {
            const u = [...p];
            u[index] = { ...u[index], animating: false, visible: true };
            return u;
          });
        }, 500);
        return updated;
      });
    }
  };

  const handlePlay = () => {
    if (currentStep >= diffData.length) {
      handleReset();
      setTimeout(() => setIsPlaying(true), 100);
    } else {
      setIsPlaying(true);
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStep(0);
    setDiffData(prev => prev.map(item => ({ ...item, visible: false, animating: false })));
  };

  const handleStepForward = () => {
    if (currentStep < diffData.length) {
      showStep(currentStep);
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleStepBack = () => {
    if (currentStep > 0) {
      const newStep = currentStep - 1;
      setDiffData(prev => {
        const updated = [...prev];
        updated[newStep] = { ...updated[newStep], visible: false, animating: false };
        return updated;
      });
      setCurrentStep(newStep);
    }
  };

  const textChanges = diffData.filter(d => d.type === 'text');
  const attrChanges = diffData.filter(d => d.type === 'attribute');
  const visibleCount = diffData.filter(d => d.visible).length;

  if (loading) {
    return <div className="text-center py-12">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">变更回放</h2>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              {visibleCount} / {diffData.length} 项变更
            </span>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">速度:</span>
              <select
                value={animationSpeed}
                onChange={(e) => setAnimationSpeed(Number(e.target.value))}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              >
                <option value={500}>快速</option>
                <option value={1000}>正常</option>
                <option value={2000}>慢速</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-center items-center space-x-4 mb-6">
          <button
            onClick={handleStepBack}
            disabled={currentStep === 0}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SkipBack className="h-5 w-5 text-gray-700" />
          </button>

          {isPlaying ? (
            <button
              onClick={handlePause}
              className="p-3 rounded-full bg-blue-100 hover:bg-blue-200"
            >
              <Pause className="h-6 w-6 text-blue-700" />
            </button>
          ) : (
            <button
              onClick={handlePlay}
              className="p-3 rounded-full bg-blue-600 hover:bg-blue-700"
            >
              <Play className="h-6 w-6 text-white" />
            </button>
          )}

          <button
            onClick={handleStepForward}
            disabled={currentStep >= diffData.length}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SkipForward className="h-5 w-5 text-gray-700" />
          </button>

          <button
            onClick={handleReset}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200"
          >
            <RefreshCw className="h-5 w-5 text-gray-700" />
          </button>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(visibleCount / diffData.length) * 100}%` }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <span className="w-3 h-3 rounded-full bg-red-500 mr-2" />
              文本变更 ({textChanges.length})
            </h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {textChanges.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  无文本变更
                </div>
              ) : (
                textChanges.map((item, index) => (
                  <ChangeItem
                    key={item.id}
                    item={item}
                    index={index}
                    visible={item.visible}
                    animating={item.animating}
                  />
                ))
              )}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <span className="w-3 h-3 rounded-full bg-purple-500 mr-2" />
              属性变更 ({attrChanges.length})
            </h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {attrChanges.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  无属性变更
                </div>
              ) : (
                attrChanges.map((item, index) => (
                  <AttributeChangeItem
                    key={item.id}
                    item={item}
                    index={index}
                    visible={item.visible}
                    animating={item.animating}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangeItem({ item, index, visible, animating }) {
  const isAdded = item.action === 'added';

  return (
    <div
      className={`
        relative overflow-hidden rounded-lg border-2 transition-all duration-500
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 h-0'}
        ${animating ? 'scale-105 shadow-lg' : ''}
        ${isAdded ? 'border-green-300' : 'border-red-300'}
      `}
      style={{ minHeight: visible ? 'auto' : '0' }}
    >
      <div className={`p-4 ${isAdded ? 'bg-green-50' : 'bg-red-50'}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-medium px-2 py-1 rounded ${
            isAdded ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
          }`}>
            {isAdded ? '新增文本' : '删除文本'}
          </span>
          <span className="text-xs text-gray-500">#{index + 1}</span>
        </div>
        <p className={`text-sm font-mono whitespace-pre-wrap break-all ${
          isAdded ? 'text-green-700' : 'text-red-700 line-through'
        }`}>
          {item.value}
        </p>
        <div className="mt-2 flex items-center text-xs text-gray-500">
          <ChevronRight className="h-3 w-3 mr-1" />
          长度: {item.value.length} 字符
        </div>
      </div>
      {animating && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent animate-pulse opacity-30" />
      )}
    </div>
  );
}

function AttributeChangeItem({ item, index, visible, animating }) {
  const getStyles = () => {
    switch (item.action) {
      case 'added':
        return {
          border: 'border-green-300',
          bg: 'bg-green-50',
          tagBg: 'bg-green-200',
          tagText: 'text-green-800',
          label: '新增属性',
        };
      case 'removed':
        return {
          border: 'border-red-300',
          bg: 'bg-red-50',
          tagBg: 'bg-red-200',
          tagText: 'text-red-800',
          label: '删除属性',
        };
      case 'modified':
        return {
          border: 'border-blue-300',
          bg: 'bg-blue-50',
          tagBg: 'bg-blue-200',
          tagText: 'text-blue-800',
          label: '修改属性',
        };
      default:
        return {
          border: 'border-gray-300',
          bg: 'bg-gray-50',
          tagBg: 'bg-gray-200',
          tagText: 'text-gray-800',
          label: '变更',
        };
    }
  };

  const styles = getStyles();

  return (
    <div
      className={`
        relative overflow-hidden rounded-lg border-2 transition-all duration-500
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 h-0'}
        ${animating ? 'scale-105 shadow-lg' : ''}
        ${styles.border}
      `}
      style={{ minHeight: visible ? 'auto' : '0' }}
    >
      <div className={`p-4 ${styles.bg}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-medium px-2 py-1 rounded ${styles.tagBg} ${styles.tagText}`}>
            {styles.label}
          </span>
          <span className="text-xs text-gray-500">#{index + 1}</span>
        </div>
        
        <div className="text-sm text-gray-700 mb-2">
          <span className="font-mono text-gray-600">{item.path}</span>
        </div>
        
        <div className="font-mono text-sm">
          <span className="font-semibold text-purple-700">{item.attribute}</span>
          {item.oldValue !== undefined && (
            <span className="text-red-600 line-through ml-2">
              ="{item.oldValue}"
            </span>
          )}
          {item.newValue !== undefined && (
            <span className="text-green-600 ml-2">
              ="{item.newValue}"
            </span>
          )}
          {item.value !== undefined && (
            <span className={`ml-2 ${item.action === 'added' ? 'text-green-600' : 'text-red-600'}`}>
              ="{item.value}"
            </span>
          )}
        </div>
      </div>
      {animating && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent animate-pulse opacity-30" />
      )}
    </div>
  );
}

export default ChangeReplayAnimation;
