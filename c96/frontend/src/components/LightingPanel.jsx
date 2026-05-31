import React from 'react';
import { Card, Collapse, Slider, Switch, ColorPicker, Select, Input, Button, Space, List, Divider } from 'antd';
import { SunOutlined, BulbOutlined, EnvironmentOutlined } from '@ant-design/icons';

const { Panel } = Collapse;

export default function LightingPanel({ lightingConfig, setLightingConfig, onSaveConfig, onExportImage, hasSelectedFloorPlan }) {
  const updateSunLight = (key, value) => {
    setLightingConfig({
      ...lightingConfig,
      sunLight: { ...lightingConfig.sunLight, [key]: value }
    });
  };

  const updateAmbientLight = (key, value) => {
    setLightingConfig({
      ...lightingConfig,
      ambientLight: { ...lightingConfig.ambientLight, [key]: value }
    });
  };

  const updateShadow = (key, value) => {
    setLightingConfig({
      ...lightingConfig,
      shadow: { ...lightingConfig.shadow, [key]: value }
    });
  };

  const addIndoorLight = () => {
    const newLight = {
      id: Date.now().toString(),
      name: `灯光 ${lightingConfig.indoorLights.length + 1}`,
      type: 'point',
      position: { x: 0, y: 3, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      intensity: 1,
      color: '#ffffff',
      enabled: true
    };
    setLightingConfig({
      ...lightingConfig,
      indoorLights: [...lightingConfig.indoorLights, newLight]
    });
  };

  const updateIndoorLight = (id, key, value) => {
    setLightingConfig({
      ...lightingConfig,
      indoorLights: lightingConfig.indoorLights.map(light =>
        light.id === id ? { ...light, [key]: value } : light
      )
    });
  };

  const removeIndoorLight = (id) => {
    setLightingConfig({
      ...lightingConfig,
      indoorLights: lightingConfig.indoorLights.filter(light => light.id !== id)
    });
  };

  return (
    <Card title="光照参数配置" style={{ height: '100%', overflow: 'auto' }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Input
          placeholder="配置名称"
          value={lightingConfig.name}
          onChange={(e) => setLightingConfig({ ...lightingConfig, name: e.target.value })}
          prefix={<span>配置名称:</span>}
        />

        <Collapse defaultActiveKey={['sun']}>
          <Panel header={<span><SunOutlined /> 太阳光</span>} key="sun">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <div style={{ marginBottom: 8 }}>启用太阳光</div>
                <Switch
                  checked={lightingConfig.sunLight.enabled}
                  onChange={(v) => updateSunLight('enabled', v)}
                />
              </div>
              
              <div>
                <div style={{ marginBottom: 8 }}>强度: {lightingConfig.sunLight.intensity.toFixed(2)}</div>
                <Slider
                  min={0}
                  max={3}
                  step={0.1}
                  value={lightingConfig.sunLight.intensity}
                  onChange={(v) => updateSunLight('intensity', v)}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8 }}>太阳高度角: {lightingConfig.sunLight.elevation}°</div>
                <Slider
                  min={0}
                  max={90}
                  value={lightingConfig.sunLight.elevation}
                  onChange={(v) => updateSunLight('elevation', v)}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8 }}>太阳方位角: {lightingConfig.sunLight.azimuth}°</div>
                <Slider
                  min={0}
                  max={360}
                  value={lightingConfig.sunLight.azimuth}
                  onChange={(v) => updateSunLight('azimuth', v)}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8 }}>时间</div>
                <Select
                  value={lightingConfig.sunLight.timeOfDay}
                  onChange={(v) => updateSunLight('timeOfDay', v)}
                  style={{ width: '100%' }}
                >
                  <Select.Option value="06:00">06:00 - 日出</Select.Option>
                  <Select.Option value="09:00">09:00 - 上午</Select.Option>
                  <Select.Option value="12:00">12:00 - 正午</Select.Option>
                  <Select.Option value="15:00">15:00 - 下午</Select.Option>
                  <Select.Option value="18:00">18:00 - 日落</Select.Option>
                  <Select.Option value="21:00">21:00 - 夜晚</Select.Option>
                </Select>
              </div>

              <div>
                <div style={{ marginBottom: 8 }}>颜色</div>
                <ColorPicker
                  value={lightingConfig.sunLight.color}
                  onChange={(color) => updateSunLight('color', color.toHexString())}
                  showText
                />
              </div>
            </Space>
          </Panel>

          <Panel header={<span><EnvironmentOutlined /> 环境光</span>} key="ambient">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <div style={{ marginBottom: 8 }}>启用环境光</div>
                <Switch
                  checked={lightingConfig.ambientLight.enabled}
                  onChange={(v) => updateAmbientLight('enabled', v)}
                />
              </div>
              
              <div>
                <div style={{ marginBottom: 8 }}>强度: {lightingConfig.ambientLight.intensity.toFixed(2)}</div>
                <Slider
                  min={0}
                  max={2}
                  step={0.1}
                  value={lightingConfig.ambientLight.intensity}
                  onChange={(v) => updateAmbientLight('intensity', v)}
                />
              </div>

              <div>
                <div style={{ marginBottom: 8 }}>颜色</div>
                <ColorPicker
                  value={lightingConfig.ambientLight.color}
                  onChange={(color) => updateAmbientLight('color', color.toHexString())}
                  showText
                />
              </div>
            </Space>
          </Panel>

          <Panel header={<span><BulbOutlined /> 室内灯光 ({lightingConfig.indoorLights.length})</span>} key="indoor">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button type="dashed" onClick={addIndoorLight} block>
                + 添加室内灯光
              </Button>
              
              <List
                dataSource={lightingConfig.indoorLights}
                renderItem={(light) => (
                  <List.Item
                    actions={[
                      <Button type="link" danger onClick={() => removeIndoorLight(light.id)}>
                        删除
                      </Button>
                    ]}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Input
                        value={light.name}
                        onChange={(e) => updateIndoorLight(light.id, 'name', e.target.value)}
                        size="small"
                      />
                      <Space>
                        <Switch
                          checked={light.enabled}
                          onChange={(v) => updateIndoorLight(light.id, 'enabled', v)}
                          size="small"
                        />
                        <Select
                          value={light.type}
                          onChange={(v) => updateIndoorLight(light.id, 'type', v)}
                          size="small"
                          style={{ width: 100 }}
                        >
                          <Select.Option value="point">点光源</Select.Option>
                          <Select.Option value="spot">聚光灯</Select.Option>
                          <Select.Option value="directional">平行光</Select.Option>
                        </Select>
                        <ColorPicker
                          value={light.color}
                          onChange={(color) => updateIndoorLight(light.id, 'color', color.toHexString())}
                          size="small"
                        />
                      </Space>
                      <div>
                        <div style={{ fontSize: 12, marginBottom: 4 }}>强度: {light.intensity.toFixed(2)}</div>
                        <Slider
                          min={0}
                          max={5}
                          step={0.1}
                          value={light.intensity}
                          onChange={(v) => updateIndoorLight(light.id, 'intensity', v)}
                          size="small"
                        />
                      </div>
                    </Space>
                  </List.Item>
                )}
              />
            </Space>
          </Panel>

          <Panel header="阴影设置" key="shadow">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <div style={{ marginBottom: 8 }}>启用阴影</div>
                <Switch
                  checked={lightingConfig.shadow.enabled}
                  onChange={(v) => updateShadow('enabled', v)}
                />
              </div>
              
              <div>
                <div style={{ marginBottom: 8 }}>阴影质量</div>
                <Select
                  value={lightingConfig.shadow.quality}
                  onChange={(v) => updateShadow('quality', v)}
                  style={{ width: '100%' }}
                >
                  <Select.Option value="low">低 (性能优先)</Select.Option>
                  <Select.Option value="medium">中 (平衡)</Select.Option>
                  <Select.Option value="high">高 (质量优先)</Select.Option>
                </Select>
              </div>
            </Space>
          </Panel>
        </Collapse>

        <Divider />

        <Space direction="vertical" style={{ width: '100%' }}>
          <Button 
            type="primary" 
            block 
            onClick={onSaveConfig}
            disabled={!hasSelectedFloorPlan}
          >
            保存光照配置
          </Button>
          <Button 
            block 
            onClick={onExportImage}
            disabled={!hasSelectedFloorPlan}
          >
            导出渲染图片
          </Button>
          {!hasSelectedFloorPlan && (
            <Text type="warning" style={{ fontSize: 12, textAlign: 'center', display: 'block' }}>
              请先在左侧选择一个户型图
            </Text>
          )}
        </Space>
      </Space>
    </Card>
  );
}
