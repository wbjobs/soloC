import React, { useState } from 'react'

function TreeNode({ node, onNodeClick, level = 0 }) {
  const [isOpen, setIsOpen] = useState(level < 2)
  const hasChildren = node.children && node.children.length > 0

  const handleClick = () => {
    if (hasChildren) {
      setIsOpen(!isOpen)
    }
    onNodeClick(node)
  }

  return (
    <div className="tree-node">
      <div className="tree-node-content" onClick={handleClick}>
        <span className="tree-icon">
          {hasChildren ? (isOpen ? '📂' : '📁') : '📄'}
        </span>
        <span className="tree-label">{node.name}</span>
        {node.count && node.count > 1 && (
          <span className="tree-badge">{node.count}</span>
        )}
      </div>
      {hasChildren && isOpen && (
        <div className="tree-children">
          {node.children.map((child, index) => (
            <TreeNode
              key={child.id || index}
              node={child}
              onNodeClick={onNodeClick}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TreeView({ data, onNodeClick }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
        <p>暂无重复文件数据</p>
        <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
          点击"重新索引"开始扫描
        </p>
      </div>
    )
  }

  return (
    <div className="tree-view">
      {data.map((node, index) => (
        <TreeNode
          key={node.id || index}
          node={node}
          onNodeClick={onNodeClick}
        />
      ))}
    </div>
  )
}

export default TreeView
