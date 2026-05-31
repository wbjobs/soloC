import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Space,
  Select,
  Progress,
  List,
  Tag,
  Divider,
  Statistic,
  Row,
  Col,
  Alert,
  Collapse,
  Typography,
  Modal,
  message
} from 'antd';
import {
  ThunderboltOutlined,
  SunOutlined,
  BarChartOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  BulbOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import {
  generateDaylightReport,
  SEASON_PRESETS,
  getDaylightLevelInfo,
  autoDetectRooms
} from '../utils/daylightAnalysis';

const { Panel } = Collapse;
const { Title, Text } = Typography;

export default function DaylightAnalysisPanel({
  lightingConfig,
  selectedFloorPlan,
  sceneRef
}) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisReport, setAnalysisReport] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState('summer');
  const [rooms, setRooms] = useState([]);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);

  useEffect(() => {
    if (selectedFloorPlan && sceneRef?.current) {
      const detectedRooms = autoDetectRooms(sceneRef.current, sceneRef.current);
      setRooms(detectedRooms);
    }
  }, [selectedFloorPlan, sceneRef]);

  const runAnalysis = async () => {
    if (!selectedFloorPlan) {
      message.warning('请先选择户型图');
      return;
    }

    if (rooms.length === 0) {
      message.warning('未检测到房间，请先加载户型图');
      return;
    }

    setIsAnalyzing(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 1500));

      const report = generateDaylightReport(rooms, lightingConfig, selectedSeason);
      setAnalysisReport(report);

      message.success('采光分析完成！');
    } catch (error) {
      console.error('分析失败:', error);
      message.error('分析失败，请重试');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const exportReport = () => {
    if (!analysisReport) return;

    const reportText = formatReportAsText(analysisReport);

    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `采光分析报告_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    message.success('报告已导出');
  };

  const formatReportAsText = (report) => {
    let text = '='.repeat(50) + '\n';
    text += '           3D户型图采光分析报告\n';
    text += '='.repeat(50) + '\n\n';

    text += `生成时间: ${new Date(report.generatedAt).toLocaleString()}\n`;
    text += `分析季节: ${report.season}\n`;
    text += `综合评分: ${report.overallScore}/100\n`;
    text += `整体评价: ${getDaylightLevelInfo(report.overallLevel).label}\n\n`;

    text += '-'.repeat(40) + '\n';
    text += '【摘要统计】\n';
    text += '-'.repeat(40) + '\n';
    text += `分析房间数: ${report.summary.totalRooms}\n`;
    text += `平均日照时长: ${report.summary.avgSunlightHours} 小时\n`;
    text += `平均辐照度: ${report.summary.avgIrradiance} W/m²\n`;
    text += `优秀: ${report.summary.excellentCount} 个\n`;
    text += `良好: ${report.summary.goodCount} 个\n`;
    text += `一般: ${report.summary.fairCount} 个\n`;
    text += `不足: ${report.summary.poorCount} 个\n\n`;

    text += '-'.repeat(40) + '\n';
    text += '【各房间详细分析】\n';
    text += '-'.repeat(40) + '\n\n';

    report.rooms.forEach(room => {
      const levelInfo = getDaylightLevelInfo(room.daylightLevel);
      text += `■ ${room.roomName}\n`;
      text += `  采光等级: ${levelInfo.label}\n`;
      text += `  日照时长: ${room.totalSunlightHours} 小时\n`;
      text += `  平均辐照度: ${room.avgIrradiance} W/m²\n`;
      text += `  有效日照时段: ${room.directSunlightSlots} 个\n`;

      text += '  小时分析: ';
      room.hourlyData.forEach(hourly => {
        text += `${hourly.time}${hourly.hasDirectSunlight ? '(☀)' : '(○)'}  `;
      });
      text += '\n\n';
    });

    text += '-'.repeat(40) + '\n';
    text += '【优化建议】\n';
    text += '-'.repeat(40) + '\n';

    report.overallRecommendations.forEach((rec, i) => {
      text += `${i + 1}. [${rec.title}] ${rec.text}\n`;
    });

    text += '\n' + '='.repeat(50) + '\n';
    text += '报告生成工具: 3D户型图光照模拟系统\n';
    text += '='.repeat(50) + '\n';

    return text;
  };

  const showRoomDetail = (room) => {
    setSelectedRoom(room);
    setDetailModalVisible(true);
  };

  const getReportIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'warning':
        return <WarningOutlined style={{ color: '#faad14' }} />;
      case 'info':
        return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
      default:
        return <BulbOutlined style={{ color: '#722ed1' }} />;
    }
  };

  const overallInfo = analysisReport ? getDaylightLevelInfo(analysisReport.overallLevel) : null;

  return (
    <Card
      title={
        <Space>
          <SunOutlined />
          <span>采光分析</span>
        </Space>
      }
      size="small"
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Row gutter={8}>
          <Col span={16}>
            <Select
              value={selectedSeason}
              onChange={setSelectedSeason}
              style={{ width: '100%' }}
              size="small"
            >
              {Object.entries(SEASON_PRESETS).map(([key, value]) => (
                <Select.Option key={key} value={key}>
                  {value.name}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col span={8}>
            <Button
              type="primary"
              icon={<BarChartOutlined />}
              onClick={runAnalysis}
              loading={isAnalyzing}
              block
              size="small"
            >
              开始分析
            </Button>
          </Col>
        </Row>

        {analysisReport && (
          <>
            <Alert
              message={
                <Space>
                  <span>综合评分:</span>
                  <Text strong style={{ fontSize: 18, color: overallInfo.color }}>
                    {analysisReport.overallScore}
                  </Text>
                  <Tag color={overallInfo.color} style={{ margin: 0 }}>
                    {overallInfo.label}
                  </Tag>
                </Space>
              }
              description={overallInfo.description}
              type={
                analysisReport.overallScore >= 60 ? 'success' :
                analysisReport.overallScore >= 40 ? 'warning' : 'error'
              }
              showIcon
            />

            <Row gutter={8}>
              <Col span={8}>
                <Statistic
                  title="分析房间"
                  value={analysisReport.summary.totalRooms}
                  suffix="个"
                  valueStyle={{ fontSize: 16 }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="平均日照"
                  value={analysisReport.summary.avgSunlightHours}
                  suffix="h"
                  valueStyle={{ fontSize: 16 }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="平均辐照度"
                  value={analysisReport.summary.avgIrradiance}
                  suffix="W/m²"
                  valueStyle={{ fontSize: 16 }}
                />
              </Col>
            </Row>

            <Collapse defaultActiveKey={['1']} size="small">
              <Panel header="各房间采光详情" key="1">
                <List
                  size="small"
                  dataSource={analysisReport.rooms}
                  renderItem={(room) => {
                    const levelInfo = getDaylightLevelInfo(room.daylightLevel);
                    return (
                      <List.Item
                        actions={[
                          <Button
                            type="link"
                            size="small"
                            onClick={() => showRoomDetail(room)}
                          >
                            详情
                          </Button>
                        ]}
                      >
                        <List.Item.Meta
                          avatar={
                            <Tag color={levelInfo.color} style={{ width: 50, textAlign: 'center' }}>
                              {levelInfo.label}
                            </Tag>
                          }
                          title={
                            <Space>
                              <Text strong>{room.roomName}</Text>
                              <SunOutlined style={{ color: levelInfo.color }} />
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {room.totalSunlightHours}h / {room.avgIrradiance}W/m²
                              </Text>
                            </Space>
                          }
                          description={
                            <Progress
                              percent={Math.round(parseFloat(room.totalSunlightHours) / 14 * 100)}
                              size="small"
                              strokeColor={levelInfo.color}
                              showInfo={false}
                              style={{ width: '100%', margin: 0 }}
                            />
                          }
                        />
                      </List.Item>
                    );
                  }}
                />
              </Panel>

              <Panel header="优化建议" key="2">
                <List
                  size="small"
                  dataSource={analysisReport.overallRecommendations}
                  renderItem={(rec) => (
                    <List.Item>
                      <Space style={{ width: '100%' }}>
                        {getReportIcon(rec.type)}
                        <div>
                          <Text strong style={{ fontSize: 12 }}>{rec.title}</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 11 }}>{rec.text}</Text>
                        </div>
                      </Space>
                    </List.Item>
                  )}
                />
              </Panel>
            </Collapse>

            <Button
              icon={<DownloadOutlined />}
              onClick={exportReport}
              block
              size="small"
            >
              导出分析报告
            </Button>
          </>
        )}

        {!analysisReport && !isAnalyzing && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#999' }}>
            <SunOutlined style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }} />
            <p>选择季节后点击"开始分析"</p>
            <p style={{ fontSize: 12 }}>将自动计算各房间日照时长并生成优化建议</p>
          </div>
        )}

        {isAnalyzing && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>正在分析采光...</div>
            <Progress percent={70} status="active" showInfo={false} />
            <p style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
              计算太阳轨迹 → 分析窗户朝向 → 评估遮挡影响 → 生成报告
            </p>
          </div>
        )}
      </Space>

      <Modal
        title={`${selectedRoom?.roomName} - 采光详情`}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={600}
      >
        {selectedRoom && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Row gutter={16}>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="采光等级"
                    value={getDaylightLevelInfo(selectedRoom.daylightLevel).label}
                    valueStyle={{ color: getDaylightLevelInfo(selectedRoom.daylightLevel).color, fontSize: 16 }}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="日照时长"
                    value={selectedRoom.totalSunlightHours}
                    suffix="h"
                    valueStyle={{ fontSize: 16 }}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="平均辐照度"
                    value={selectedRoom.avgIrradiance}
                    suffix="W/m²"
                    valueStyle={{ fontSize: 16 }}
                  />
                </Card>
              </Col>
            </Row>

            <Divider style={{ margin: '8px 0' }} />

            <Title level={5} style={{ margin: 0 }}>时段光照分析</Title>
            <List
              size="small"
              dataSource={selectedRoom.hourlyData}
              renderItem={(hourly) => (
                <List.Item>
                  <Space style={{ width: '100%' }}>
                    <Tag color={hourly.hasDirectSunlight ? 'gold' : 'default'}>
                      {hourly.time}
                    </Tag>
                    <span>
                      太阳高度: {hourly.sunAltitude}° |
                      曝光: {Math.round(hourly.exposure * 100)}% |
                      辐照度: {Math.round(hourly.irradiance)} W/m²
                    </span>
                    {hourly.hasDirectSunlight && <SunOutlined style={{ color: '#faad14' }} />}
                  </Space>
                </List.Item>
              )}
            />

            <Divider style={{ margin: '8px 0' }} />

            <Title level={5} style={{ margin: 0 }}>房间优化建议</Title>
            <List
              size="small"
              dataSource={selectedRoom.recommendations}
              renderItem={(rec) => (
                <List.Item>
                  <Space>
                    {getReportIcon(rec.type)}
                    <Text type="secondary">{rec.text}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </Space>
        )}
      </Modal>
    </Card>
  );
}
