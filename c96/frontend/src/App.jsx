import React, { useState, useEffect, useRef } from 'react';
import { Layout, message, ConfigProvider, Tabs } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Scene3D from './components/Scene3D';
import LightingPanel from './components/LightingPanel';
import Sidebar from './components/Sidebar';
import DaylightAnalysisPanel from './components/DaylightAnalysisPanel';
import BatchLightingPanel from './components/BatchLightingPanel';
import { floorPlanApi, lightingConfigApi } from './services/api';
import { getDefaultLightingConfig } from './utils/lightingUtils';
import 'antd/dist/reset.css';

const { Sider, Content } = Layout;

function App() {
  const [floorPlans, setFloorPlans] = useState([]);
  const [selectedFloorPlan, setSelectedFloorPlan] = useState(null);
  const [lightingConfig, setLightingConfig] = useState(getDefaultLightingConfig(null));
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadFloorPlans();
  }, []);

  useEffect(() => {
    if (selectedFloorPlan) {
      setLightingConfig(getDefaultLightingConfig(selectedFloorPlan._id));
      loadSavedConfigs(selectedFloorPlan._id);
    } else {
      setSavedConfigs([]);
      setLightingConfig(getDefaultLightingConfig(null));
    }
  }, [selectedFloorPlan]);

  const loadFloorPlans = async () => {
    try {
      const response = await floorPlanApi.getAll();
      setFloorPlans(response.data);
    } catch (error) {
      console.error('加载户型图失败:', error);
      message.error('加载户型图列表失败');
    }
  };

  const loadSavedConfigs = async (floorPlanId) => {
    if (!floorPlanId) return;
    
    try {
      setIsLoading(true);
      const response = await lightingConfigApi.getByFloorPlan(floorPlanId);
      setSavedConfigs(response.data.configs || []);
      console.log(`已加载 ${response.data.configs?.length || 0} 个保存的配置`);
    } catch (error) {
      console.error('加载配置失败:', error);
      message.error('加载保存的配置失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadFloorPlan = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', file.name);
    
    try {
      const response = await floorPlanApi.upload(formData);
      await loadFloorPlans();
      message.success('户型图上传成功');
      return response.data;
    } catch (error) {
      message.error('上传失败: ' + (error.response?.data?.error || error.message));
      throw error;
    }
  };

  const handleDeleteFloorPlan = async (id) => {
    try {
      await floorPlanApi.delete(id);
      
      if (selectedFloorPlan?._id === id) {
        setSelectedFloorPlan(null);
      }
      
      setFloorPlans(floorPlans.filter(f => f._id !== id));
      message.success('户型图及关联配置已删除');
    } catch (error) {
      message.error('删除失败: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedFloorPlan) {
      message.warning('请先选择一个户型图');
      return;
    }
    
    if (!lightingConfig.name) {
      message.warning('请输入配置名称');
      return;
    }

    try {
      const configToSave = {
        ...lightingConfig,
        floorPlanId: selectedFloorPlan._id
      };
      
      console.log('保存配置:', configToSave);
      
      const response = await lightingConfigApi.create(configToSave);
      
      await loadSavedConfigs(selectedFloorPlan._id);
      message.success('光照配置保存成功');
      
      return response.data;
    } catch (error) {
      console.error('保存配置错误:', error);
      message.error('保存失败: ' + (error.response?.data?.error || error.message));
    }
  };

  const [currentConfigId, setCurrentConfigId] = useState(null);

  const handleLoadConfig = (config) => {
    console.log('加载配置:', config);
    
    const loadedConfig = {
      ...config,
      _id: config._id,
      floorPlanId: config.floorPlanId?._id || config.floorPlanId
    };
    
    setLightingConfig(loadedConfig);
    setCurrentConfigId(config._id);
    message.success(`已加载配置: ${config.name}`);
  };

  const handleExportImage = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      try {
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        link.download = `lighting-render-${timestamp}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        message.success('图片导出成功');
      } catch (error) {
        console.error('导出图片失败:', error);
        message.error('图片导出失败');
      }
    } else {
      message.error('未找到渲染画布');
    }
  };

  const handleFloorPlanChange = (floorPlan) => {
    setSelectedFloorPlan(floorPlan);
    if (floorPlan) {
      message.info(`已切换到户型图: ${floorPlan.name}`);
    }
  };

  const handleUpdateIndoorLights = (updatedLights) => {
    setLightingConfig({
      ...lightingConfig,
      indoorLights: updatedLights
    });
  };

  const sceneRef = useRef(null);

  return (
    <ConfigProvider locale={zhCN}>
      <Layout style={{ height: '100vh', width: '100vw' }}>
        <Sider 
          width={280} 
          style={{ 
            background: '#f0f2f5', 
            padding: 16, 
            overflow: 'auto' 
          }}
        >
          <Sidebar
            floorPlans={floorPlans}
            selectedFloorPlan={selectedFloorPlan}
            setSelectedFloorPlan={handleFloorPlanChange}
            savedConfigs={savedConfigs.map(c => ({ ...c, isActive: c._id === currentConfigId }))}
            isLoadingConfigs={isLoading}
            onUploadFloorPlan={handleUploadFloorPlan}
            onDeleteFloorPlan={handleDeleteFloorPlan}
            onLoadConfig={handleLoadConfig}
          />
        </Sider>
        
        <Content style={{ position: 'relative', background: '#1a1a2e' }}>
          <Scene3D
            floorPlan={selectedFloorPlan}
            lightingConfig={lightingConfig}
          />
          
          {!selectedFloorPlan && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'white',
              textAlign: 'center',
              pointerEvents: 'none'
            }}>
              <h2>欢迎使用 3D 光照模拟工具</h2>
              <p style={{ opacity: 0.7 }}>请在左侧面板上传或选择一个户型图开始</p>
            </div>
          )}
        </Content>
        
        <Sider 
          width={360} 
          style={{ 
            background: '#f0f2f5', 
            padding: 16,
            overflow: 'auto'
          }}
        >
          <Tabs
            defaultActiveKey="lighting"
            size="small"
            items={[
              {
                key: 'lighting',
                label: '光照配置',
                children: (
                  <LightingPanel
                    lightingConfig={lightingConfig}
                    setLightingConfig={setLightingConfig}
                    onSaveConfig={handleSaveConfig}
                    onExportImage={handleExportImage}
                    hasSelectedFloorPlan={!!selectedFloorPlan}
                  />
                )
              },
              {
                key: 'batch',
                label: '批量管理',
                children: (
                  <BatchLightingPanel
                    indoorLights={lightingConfig.indoorLights}
                    onUpdateLights={handleUpdateIndoorLights}
                    hasSelectedFloorPlan={!!selectedFloorPlan}
                  />
                )
              },
              {
                key: 'analysis',
                label: '采光分析',
                children: (
                  <DaylightAnalysisPanel
                    lightingConfig={lightingConfig}
                    selectedFloorPlan={selectedFloorPlan}
                    sceneRef={sceneRef}
                  />
                )
              }
            ]}
          />
        </Sider>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
