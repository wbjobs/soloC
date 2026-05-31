import React, { useState } from 'react';
import {
  Card,
  Button,
  Space,
  Slider,
  ColorPicker,
  Select,
  Checkbox,
  List,
  Divider,
  Tag,
  Typography,
  Row,
  Col,
  message,
  Collapse,
  InputNumber
} from 'antd';
import {
  ThunderboltOutlined,
  BulbOutlined,
  CheckOutlined,
  CloseOutlined,
  SettingOutlined,
  BgColorsOutlined
} from '@ant-design/icons';

const { Panel } = Collapse;
const { Text } = Typography;

export default function BatchLightingPanel({
  indoorLights,
  onUpdateLights,
  hasSelectedFloorPlan
}) {
  const [selectedLights, setSelectedLights] = useState([]);
  const [batchColor, setBatchColor] = useState('#ffffff');
  const [batchIntensity, setBatchIntensity] = useState(1);
  const [selectAll, setSelectAll] = useState(false);

  const lightTypes = [
    { value: 'point', label: '点光源', icon: '🔴' },
    { value: 'spot', label: '聚光灯', icon: '🔦' },
    { value: 'directional', label: '平行光', icon: '☀️' }
  ];

  const toggleSelectAll = (checked) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedLights(indoorLights.map(l => l.id));
    } else {
      setSelectedLights([]);
    }
  };

  const toggleLightSelection = (lightId) => {
    if (selectedLights.includes(lightId)) {
      setSelectedLights(selectedLights.filter(id => id !== lightId));
    } else {
      setSelectedLights([...selectedLights, lightId]);
    }
  };

  const applyBatchColor = () => {
    if (selectedLights.length === 0) {
      message.warning('请先选择要修改的灯光');
      return;
    }

    const updatedLights = indoorLights.map(light => {
      if (selectedLights.includes(light.id)) {
        return { ...light, color: batchColor };
      }
      return light;
    });

    onUpdateLights(updatedLights);
    message.success(`已更新 ${selectedLights.length} 个灯光的颜色`);
  };

  const applyBatchIntensity = () => {
    if (selectedLights.length === 0) {
      message.warning('请先选择要修改的灯光');
      return;
    }

    const updatedLights = indoorLights.map(light => {
      if (selectedLights.includes(light.id)) {
        return { ...light, intensity: batchIntensity };
      }
      return light;
    });

    onUpdateLights(updatedLights);
    message.success(`已更新 ${selectedLights.length} 个灯光的亮度`);
  };

  const selectByType = (type) => {
    const typeLights = indoorLights.filter(l => l.type === type).map(l => l.id);
    setSelectedLights(typeLights);
    setSelectAll(typeLights.length === indoorLights.length && indoorLights.length > 0);
  };

  const enableSelected = (enabled) => {
    if (selectedLights.length === 0) {
      message.warning('请先选择要修改的灯光');
      return;
    }

    const updatedLights = indoorLights.map(light => {
      if (selectedLights.includes(light.id)) {
        return { ...light, enabled };
      }
      return light;
    });

    onUpdateLights(updatedLights);
    message.success(`已${enabled ? '启用' : '禁用'} ${selectedLights.length} 个灯光`);
  };

  const deleteSelected = () => {
    if (selectedLights.length === 0) {
      message.warning('请先选择要删除的灯光');
      return;
    }

    const remainingLights = indoorLights.filter(light =>
      !selectedLights.includes(light.id)
    );

    onUpdateLights(remainingLights);
    setSelectedLights([]);
    setSelectAll(false);
    message.success(`已删除 ${selectedLights.length} 个灯光`);
  };

  const getTypeIcon = (type) => {
    const typeInfo = lightTypes.find(t => t.value === type);
    return typeInfo ? typeInfo.icon : '💡';
  };

  return (
    <Card
      title={
        <Space>
          <ThunderboltOutlined />
          <span>灯光批量管理</span>
          {selectedLights.length > 0 && (
            <Tag color="blue">已选 {selectedLights.length} 个</Tag>
          )}
        </Space>
      }
      size="small"
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {!hasSelectedFloorPlan ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#999' }}>
            <BulbOutlined style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }} />
            <p>请先选择户型图并添加灯光</p>
          </div>
        ) : (
          <>
            <Row gutter={8} align="middle">
              <Col span={8}>
                <Checkbox
                  checked={selectAll}
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                >
                  全选
                </Checkbox>
              </Col>
              <Col span={16}>
                <Space wrap size="small">
                  {lightTypes.map(type => (
                    <Button
                      key={type.value}
                      size="small"
                      onClick={() => selectByType(type.value)}
                    >
                      {type.icon} {type.label}
                    </Button>
                  ))}
                </Space>
              </Col>
            </Row>

            <Collapse defaultActiveKey={['1', '2']} size="small">
              <Panel
                header={
                  <Space>
                    <BgColorsOutlined />
                    <span>批量颜色设置</span>
                  </Space>
                }
                key="1"
              >
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  <Row align="middle" gutter={16}>
                    <Col span={12}>
                      <Text type="secondary">选择颜色:</Text>
                    </Col>
                    <Col span={12} style={{ textAlign: 'right' }}>
                      <ColorPicker
                        value={batchColor}
                        onChange={(color) => setBatchColor(color.toHexString())}
                        showText
                      />
                    </Col>
                  </Row>
                  <Button
                    type="primary"
                    block
                    size="small"
                    onClick={applyBatchColor}
                    disabled={selectedLights.length === 0}
                    icon={<CheckOutlined />}
                  >
                    应用颜色到选中灯光 ({selectedLights.length})
                  </Button>
                </Space>
              </Panel>

              <Panel
                header={
                  <Space>
                    <SettingOutlined />
                    <span>批量亮度设置</span>
                  </Space>
                }
                key="2"
              >
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  <Row align="middle" gutter={16}>
                    <Col span={6}>
                      <Text type="secondary">亮度:</Text>
                    </Col>
                    <Col span={14}>
                      <Slider
                        min={0}
                        max={5}
                        step={0.1}
                        value={batchIntensity}
                        onChange={setBatchIntensity}
                      />
                    </Col>
                    <Col span={4} style={{ textAlign: 'right' }}>
                      <InputNumber
                        min={0}
                        max={5}
                        step={0.1}
                        value={batchIntensity}
                        onChange={setBatchIntensity}
                        size="small"
                        style={{ width: '100%' }}
                      />
                    </Col>
                  </Row>
                  <Button
                    type="primary"
                    block
                    size="small"
                    onClick={applyBatchIntensity}
                    disabled={selectedLights.length === 0}
                    icon={<CheckOutlined />}
                  >
                    应用亮度到选中灯光 ({selectedLights.length})
                  </Button>
                </Space>
              </Panel>
            </Collapse>

            <Row gutter={8}>
              <Col span={8}>
                <Button
                  type="primary"
                  ghost
                  size="small"
                  block
                  onClick={() => enableSelected(true)}
                  disabled={selectedLights.length === 0}
                  icon={<CheckOutlined />}
                >
                  批量启用
                </Button>
              </Col>
              <Col span={8}>
                <Button
                  danger
                  ghost
                  size="small"
                  block
                  onClick={() => enableSelected(false)}
                  disabled={selectedLights.length === 0}
                  icon={<CloseOutlined />}
                >
                  批量禁用
                </Button>
              </Col>
              <Col span={8}>
                <Button
                  danger
                  size="small"
                  block
                  onClick={deleteSelected}
                  disabled={selectedLights.length === 0}
                >
                  删除选中
                </Button>
              </Col>
            </Row>

            <Divider style={{ margin: '8px 0' }} />

            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              <List
                size="small"
                dataSource={indoorLights}
                locale={{ emptyText: '暂无室内灯光，请在灯光配置中添加' }}
                renderItem={(light) => (
                  <List.Item
                    style={{
                      background: selectedLights.includes(light.id) ? '#e6f7ff' : 'transparent',
                      borderRadius: 4,
                      padding: '4px 8px',
                      margin: '2px 0'
                    }}
                  >
                    <Space style={{ width: '100%' }}>
                      <Checkbox
                        checked={selectedLights.includes(light.id)}
                        onChange={() => toggleLightSelection(light.id)}
                      />
                      <span style={{ fontSize: 16 }}>{getTypeIcon(light.type)}</span>
                      <div style={{ flex: 1 }}>
                        <Text strong style={{ fontSize: 12 }}>{light.name}</Text>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              background: light.color,
                              border: '1px solid #ddd'
                            }}
                          />
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            亮度: {light.intensity.toFixed(1)}
                          </Text>
                          <Tag
                            color={light.enabled ? 'success' : 'default'}
                            style={{ fontSize: 10, padding: '0 4px', margin: 0 }}
                          >
                            {light.enabled ? '开' : '关'}
                          </Tag>
                        </div>
                      </div>
                    </Space>
                  </List.Item>
                )}
              />
            </div>
          </>
        )}
      </Space>
    </Card>
  );
}
