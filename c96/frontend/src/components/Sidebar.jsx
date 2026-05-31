import React, { useState } from 'react';
import { Card, Upload, Button, List, Select, Space, message, Modal, Typography, Divider } from 'antd';
import { UploadOutlined, DeleteOutlined, SaveOutlined, FileOutlined, ThunderboltOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export default function Sidebar({
  floorPlans,
  selectedFloorPlan,
  setSelectedFloorPlan,
  savedConfigs,
  isLoadingConfigs,
  onUploadFloorPlan,
  onDeleteFloorPlan,
  onLoadConfig
}) {
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      await onUploadFloorPlan(file);
      setUploadModalVisible(false);
      message.success('户型图上传成功');
    } catch (error) {
      message.error('上传失败');
    }
    setUploading(false);
    return false;
  };

  const handleDeleteConfirm = () => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除户型图 "${selectedFloorPlan.name}" 吗？关联的光照配置也将被删除。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => onDeleteFloorPlan(selectedFloorPlan._id)
    });
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Card 
        size="small" 
        title={
          <Space>
            <FileOutlined />
            <span>户型图管理</span>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={() => setUploadModalVisible(true)}
            block
          >
            上传户型图 (GLB/GLTF)
          </Button>
          
          <Select
            placeholder="选择户型图"
            value={selectedFloorPlan?._id}
            onChange={(id) => {
              const fp = floorPlans.find(f => f._id === id);
              setSelectedFloorPlan(fp || null);
            }}
            style={{ width: '100%' }}
            allowClear
            showSearch
            optionFilterProp="children"
          >
            {floorPlans.map(fp => (
              <Select.Option key={fp._id} value={fp._id}>
                {fp.name}
              </Select.Option>
            ))}
          </Select>

          {selectedFloorPlan && (
            <Space direction="vertical" size="small" style={{ width: '100%', padding: 8, background: '#e6f7ff', borderRadius: 4 }}>
              <Text strong>{selectedFloorPlan.name}</Text>
              {selectedFloorPlan.description && (
                <Text type="secondary" style={{ fontSize: 12 }}>{selectedFloorPlan.description}</Text>
              )}
              <Text type="secondary" style={{ fontSize: 12 }}>
                格式: {selectedFloorPlan.fileType?.toUpperCase()}
              </Text>
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleDeleteConfirm}
                block
                size="small"
              >
                删除此户型图
              </Button>
            </Space>
          )}
        </Space>
      </Card>

      <Card 
        size="small" 
        title={
          <Space>
            <ThunderboltOutlined />
            <span>光照配置库</span>
          </Space>
        }
        extra={savedConfigs.length > 0 && <Text type="secondary" style={{ fontSize: 12 }}>{savedConfigs.length} 个配置</Text>}
      >
        {isLoadingConfigs ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Text type="secondary">加载中...</Text>
          </div>
        ) : (
          <List
            size="small"
            dataSource={savedConfigs}
            locale={{ emptyText: '暂无保存的配置，在右侧调整参数后保存' }}
            renderItem={(config) => (
              <List.Item
                style={{
                  background: config.isActive ? '#f0f0f0' : 'transparent',
                  borderRadius: 4,
                  padding: '8px 12px'
                }}
                actions={[
                  <Button
                    type="link"
                    size="small"
                    icon={<SaveOutlined />}
                    onClick={() => onLoadConfig(config)}
                  >
                    加载
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Text strong style={{ fontSize: 13 }}>{config.name}</Text>
                    </Space>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      太阳光: {config.sunLight?.enabled ? '开启' : '关闭'} | 
                      阴影: {config.shadow?.enabled ? '开启' : '关闭'}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      <Modal
        title="上传户型图 3D 模型"
        open={uploadModalVisible}
        onCancel={() => setUploadModalVisible(false)}
        footer={null}
        width={400}
      >
        <Upload.Dragger
          beforeUpload={handleUpload}
          accept=".glb,.gltf,.obj"
          showUploadList={false}
          disabled={uploading}
          style={{ padding: '40px 20px' }}
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined style={{ fontSize: 48, color: '#1890ff' }} />
          </p>
          <p className="ant-upload-text" style={{ fontSize: 16, marginBottom: 8 }}>
            点击或拖拽文件到此处上传
          </p>
          <p className="ant-upload-hint" style={{ color: '#999' }}>
            支持 GLB、GLTF、OBJ 格式的 3D 模型文件
          </p>
          {uploading && (
            <div style={{ marginTop: 16 }}>
              <Text type="warning">上传中...</Text>
            </div>
          )}
        </Upload.Dragger>

        <Divider />

        <div style={{ padding: '0 20px' }}>
          <Title level={5} style={{ marginBottom: 8 }}>上传须知</Title>
          <ul style={{ paddingLeft: 20, margin: 0, color: '#666' }}>
            <li>推荐使用 GLB 格式（单文件，包含材质和纹理）</li>
            <li>模型面数建议控制在 10 万面以内以保证性能</li>
            <li>确保模型坐标系正确，Y轴向上</li>
            <li>模型会自动居中并缩放到合适大小</li>
          </ul>
        </div>
      </Modal>
    </Space>
  );
}
