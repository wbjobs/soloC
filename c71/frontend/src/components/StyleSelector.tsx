import React from 'react';
import { Style } from '../types';

interface StyleSelectorProps {
  selectedStyle: Style;
  onStyleChange: (style: Style) => void;
}

const styles: { value: Style; label: string; description: string }[] = [
  { value: 'pop', label: '流行', description: '现代流行和弦进行' },
  { value: 'jazz', label: '爵士', description: '爵士七和弦和声' },
  { value: 'classical', label: '古典', description: '古典和声进行' },
];

const StyleSelector: React.FC<StyleSelectorProps> = ({ selectedStyle, onStyleChange }) => {
  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4">伴奏风格</h3>
      <div className="grid grid-cols-3 gap-4">
        {styles.map((style) => (
          <button
            key={style.value}
            onClick={() => onStyleChange(style.value)}
            className={`p-4 rounded-lg border-2 transition-all text-left
              ${selectedStyle === style.value
                ? 'border-indigo-500 bg-indigo-500/20'
                : 'border-gray-600 bg-gray-800/50 hover:border-gray-500'
              }
            `}
          >
            <div className="font-semibold mb-1">{style.label}</div>
            <div className="text-xs text-gray-400">{style.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default StyleSelector;
