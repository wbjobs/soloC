package main

import (
	"container/list"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/influxdata/influxdb-client-go/v2/api"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

type SensorData struct {
	DeviceID   string  `json:"device_id"`
	SensorType string  `json:"sensor_type"`
	Value      float64 `json:"value"`
	Timestamp  int64   `json:"timestamp"`
	Sequence   uint64  `json:"sequence"`
}

type Rule struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Condition   string      `json:"condition"`
	Action      RuleAction  `json:"action"`
	Enabled     bool        `json:"enabled"`
	CreatedAt   int64       `json:"created_at"`
	UpdatedAt   int64       `json:"updated_at"`
}

type RuleAction struct {
	Type       string                 `json:"type"`
	Actuator   string                 `json:"actuator"`
	Params     map[string]interface{} `json:"params"`
}

type RuleEvent struct {
	ID         string      `json:"id"`
	RuleID     string      `json:"rule_id"`
	RuleName   string      `json:"rule_name"`
	DeviceID   string      `json:"device_id"`
	SensorType string      `json:"sensor_type"`
	Value      float64     `json:"value"`
	Action     RuleAction  `json:"action"`
	Timestamp  int64       `json:"timestamp"`
}

type Config struct {
	MQTTBroker   string
	MQTTPort     int
	InfluxURL    string
	InfluxToken  string
	InfluxOrg    string
	InfluxBucket string
	DedupSize    int
	DataDir      string
}

type SequenceLRU struct {
	capacity int
	cache    map[uint64]*list.Element
	ll       *list.List
	mu       sync.Mutex
}

func NewSequenceLRU(capacity int) *SequenceLRU {
	return &SequenceLRU{
		capacity: capacity,
		cache:    make(map[uint64]*list.Element),
		ll:       list.New(),
	}
}

func (l *SequenceLRU) Contains(sequence uint64) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	if elem, ok := l.cache[sequence]; ok {
		l.ll.MoveToFront(elem)
		return true
	}
	return false
}

func (l *SequenceLRU) Add(sequence uint64) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if _, ok := l.cache[sequence]; ok {
		return
	}

	elem := l.ll.PushFront(sequence)
	l.cache[sequence] = elem

	if l.ll.Len() > l.capacity {
		oldest := l.ll.Back()
		if oldest != nil {
			l.ll.Remove(oldest)
			delete(l.cache, oldest.Value.(uint64))
		}
	}
}

var (
	cfg          Config
	influxClient influxdb2.Client
	writeAPI     api.WriteAPIBlocking
	queryAPI     api.QueryAPI
	dedupCache   *SequenceLRU
	rulesStore   = make(map[string]Rule)
	rulesMu      sync.RWMutex
)

func loadConfig() {
	cfg = Config{
		MQTTBroker:   getEnv("MQTT_BROKER", "localhost"),
		MQTTPort:     getEnvAsInt("MQTT_PORT", 1883),
		InfluxURL:    getEnv("INFLUX_URL", "http://localhost:8086"),
		InfluxToken:  getEnv("INFLUX_TOKEN", "my-super-secret-auth-token"),
		InfluxOrg:    getEnv("INFLUX_ORG", "iot-org"),
		InfluxBucket: getEnv("INFLUX_BUCKET", "iot-data"),
		DedupSize:    getEnvAsInt("DEDUP_SIZE", 50000),
		DataDir:      getEnv("DATA_DIR", "./data"),
	}
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	if value, exists := os.LookupEnv(key); exists {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func initDataDir() error {
	if err := os.MkdirAll(cfg.DataDir, 0755); err != nil {
		return err
	}
	return loadRulesFromFile()
}

func getRulesFilePath() string {
	return filepath.Join(cfg.DataDir, "rules.json")
}

func loadRulesFromFile() error {
	filePath := getRulesFilePath()
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		saveRulesToFile()
		return nil
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return err
	}

	var rules []Rule
	if err := json.Unmarshal(data, &rules); err != nil {
		return err
	}

	rulesMu.Lock()
	defer rulesMu.Unlock()
	for _, rule := range rules {
		rulesStore[rule.ID] = rule
	}
	return nil
}

func saveRulesToFile() error {
	rulesMu.RLock()
	defer rulesMu.RUnlock()

	var rules []Rule
	for _, rule := range rulesStore {
		rules = append(rules, rule)
	}

	data, err := json.MarshalIndent(rules, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(getRulesFilePath(), data, 0644)
}

func initInfluxDB() {
	influxClient = influxdb2.NewClient(cfg.InfluxURL, cfg.InfluxToken)
	writeAPI = influxClient.WriteAPIBlocking(cfg.InfluxOrg, cfg.InfluxBucket)
	queryAPI = influxClient.QueryAPI(cfg.InfluxOrg)
	log.Println("InfluxDB 客户端已初始化")
}

func publishRuleUpdate(client mqtt.Client) {
	rulesMu.RLock()
	defer rulesMu.RUnlock()

	var rules []Rule
	for _, rule := range rulesStore {
		rules = append(rules, rule)
	}

	data, err := json.Marshal(map[string]interface{}{
		"type":      "rules_sync",
		"rules":     rules,
		"timestamp": time.Now().UnixMilli(),
	})
	if err != nil {
		log.Printf("规则同步消息序列化失败: %v", err)
		return
	}

	token := client.Publish("iot/rules/update", 1, false, data)
	token.Wait()
	if token.Error() != nil {
		log.Printf("发布规则更新失败: %v", token.Error())
	} else {
		log.Printf("已向边缘设备同步 %d 条规则", len(rules))
	}
}

func initMQTT() mqtt.Client {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(fmt.Sprintf("tcp://%s:%d", cfg.MQTTBroker, cfg.MQTTPort))
	opts.SetClientID("iot-backend")
	opts.SetDefaultPublishHandler(messageHandler)
	opts.OnConnect = connectHandler
	opts.OnConnectionLost = connectLostHandler

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		log.Fatalf("MQTT 连接失败: %v", token.Error())
	}

	return client
}

var messageHandler mqtt.MessageHandler = func(client mqtt.Client, msg mqtt.Message) {
	var data SensorData
	if err := json.Unmarshal(msg.Payload(), &data); err != nil {
		log.Printf("解析消息失败: %v, 主题: %s", err, msg.Topic())
		return
	}

	if dedupCache.Contains(data.Sequence) {
		log.Printf("检测到重复消息，跳过: sequence=%d", data.Sequence)
		return
	}

	point := influxdb2.NewPointWithMeasurement("sensor_data").
		AddTag("device_id", data.DeviceID).
		AddTag("sensor_type", data.SensorType).
		AddField("value", data.Value).
		AddField("sequence", data.Sequence).
		SetTime(time.UnixMilli(data.Timestamp))

	if err := writeAPI.WritePoint(context.Background(), point); err != nil {
		log.Printf("写入 InfluxDB 失败: %v", err)
	} else {
		dedupCache.Add(data.Sequence)
	}
}

var connectHandler mqtt.OnConnectHandler = func(client mqtt.Client) {
	log.Println("已连接到 MQTT Broker")
	topic := "iot/devices/+/sensors/+"
	if token := client.Subscribe(topic, 1, nil); token.Wait() && token.Error() != nil {
		log.Printf("订阅主题 %s 失败: %v", topic, token.Error())
	} else {
		log.Printf("已订阅主题: %s", topic)
	}

	client.Subscribe("iot/rules/request_sync", 1, func(client mqtt.Client, msg mqtt.Message) {
		log.Println("收到边缘设备规则同步请求")
		publishRuleUpdate(client)
	})

	publishRuleUpdate(client)
}

var connectLostHandler mqtt.ConnectionLostHandler = func(client mqtt.Client, err error) {
	log.Printf("MQTT 连接丢失: %v", err)
}

func getRules(c echo.Context) error {
	rulesMu.RLock()
	defer rulesMu.RUnlock()

	var rules []Rule
	for _, rule := range rulesStore {
		rules = append(rules, rule)
	}
	return c.JSON(http.StatusOK, rules)
}

func getRule(c echo.Context) error {
	id := c.Param("id")
	rulesMu.RLock()
	defer rulesMu.RUnlock()

	rule, exists := rulesStore[id]
	if !exists {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "规则不存在"})
	}
	return c.JSON(http.StatusOK, rule)
}

func createRule(c echo.Context) error {
	var rule Rule
	if err := c.Bind(&rule); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}

	if rule.Name == "" || rule.Condition == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "名称和条件不能为空"})
	}

	now := time.Now().UnixMilli()
	rule.ID = fmt.Sprintf("rule_%d", now)
	rule.CreatedAt = now
	rule.UpdatedAt = now
	if rule.Action.Type == "" {
		rule.Action.Type = "actuator"
	}

	rulesMu.Lock()
	rulesStore[rule.ID] = rule
	rulesMu.Unlock()

	if err := saveRulesToFile(); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	mqttClient := c.Get("mqtt").(mqtt.Client)
	publishRuleUpdate(mqttClient)

	return c.JSON(http.StatusCreated, rule)
}

func updateRule(c echo.Context) error {
	id := c.Param("id")
	
	var rule Rule
	if err := c.Bind(&rule); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}

	rulesMu.Lock()
	defer rulesMu.Unlock()

	existing, exists := rulesStore[id]
	if !exists {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "规则不存在"})
	}

	rule.ID = id
	rule.CreatedAt = existing.CreatedAt
	rule.UpdatedAt = time.Now().UnixMilli()
	rulesStore[id] = rule

	if err := saveRulesToFile(); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	mqttClient := c.Get("mqtt").(mqtt.Client)
	publishRuleUpdate(mqttClient)

	return c.JSON(http.StatusOK, rule)
}

func deleteRule(c echo.Context) error {
	id := c.Param("id")
	rulesMu.Lock()
	defer rulesMu.Unlock()

	if _, exists := rulesStore[id]; !exists {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "规则不存在"})
	}

	delete(rulesStore, id)

	if err := saveRulesToFile(); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	mqttClient := c.Get("mqtt").(mqtt.Client)
	publishRuleUpdate(mqttClient)

	return c.JSON(http.StatusOK, map[string]string{"message": "删除成功"})
}

func getSensorData(c echo.Context) error {
	deviceID := c.QueryParam("device_id")
	sensorType := c.QueryParam("sensor_type")
	limit := c.QueryParam("limit")

	if limit == "" {
		limit = "100"
	}

	query := fmt.Sprintf(`
		from(bucket:"%s")
		|> range(start: -1h)
		|> filter(fn: (r) => r._measurement == "sensor_data")
	`, cfg.InfluxBucket)

	if deviceID != "" {
		query += fmt.Sprintf(`|> filter(fn: (r) => r.device_id == "%s")`, deviceID)
	}
	if sensorType != "" {
		query += fmt.Sprintf(`|> filter(fn: (r) => r.sensor_type == "%s")`, sensorType)
	}
	query += fmt.Sprintf(`|> sort(columns: ["_time"], desc: true)|> limit(n: %s)`, limit)

	result, err := queryAPI.Query(context.Background(), query)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	defer result.Close()

	var data []map[string]interface{}
	for result.Next() {
		record := result.Record()
		item := map[string]interface{}{
			"device_id":   record.ValueByKey("device_id"),
			"sensor_type": record.ValueByKey("sensor_type"),
			"value":       record.Value(),
			"timestamp":   record.Time().UnixMilli(),
		}
		data = append(data, item)
	}

	if err := result.Err(); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	return c.JSON(http.StatusOK, data)
}

func getDevices(c echo.Context) error {
	query := fmt.Sprintf(`
		import "influxdata/influxdb/schema"
		schema.tagValues(
		  bucket: "%s",
		  tag: "device_id",
		  start: -24h
		)
	`, cfg.InfluxBucket)

	result, err := queryAPI.Query(context.Background(), query)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	defer result.Close()

	var devices []string
	for result.Next() {
		devices = append(devices, result.Record().Value().(string))
	}

	return c.JSON(http.StatusOK, devices)
}

func getStats(c echo.Context) error {
	query := fmt.Sprintf(`
		from(bucket:"%s")
		|> range(start: -1h)
		|> filter(fn: (r) => r._measurement == "sensor_data" and r._field == "value")
		|> count()
	`, cfg.InfluxBucket)

	result, err := queryAPI.Query(context.Background(), query)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	defer result.Close()

	count := 0
	for result.Next() {
		count += int(result.Record().Value().(int64))
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"count_last_hour": count,
	})
}

func main() {
	loadConfig()
	
	if err := initDataDir(); err != nil {
		log.Fatalf("初始化数据目录失败: %v", err)
	}

	dedupCache = NewSequenceLRU(cfg.DedupSize)
	log.Printf("去重缓存已初始化，容量: %d", cfg.DedupSize)
	initInfluxDB()
	defer influxClient.Close()

	client := initMQTT()
	defer client.Disconnect(250)

	e := echo.New()
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
	}))
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			c.Set("mqtt", client)
			return next(c)
		}
	})

	e.GET("/api/sensors", getSensorData)
	e.GET("/api/devices", getDevices)
	e.GET("/api/stats", getStats)

	e.GET("/api/rules", getRules)
	e.GET("/api/rules/:id", getRule)
	e.POST("/api/rules", createRule)
	e.PUT("/api/rules/:id", updateRule)
	e.DELETE("/api/rules/:id", deleteRule)

	log.Println("服务器启动于 :8080")
	if err := e.Start(":8080"); err != nil {
		log.Fatalf("服务器启动失败: %v", err)
	}
}
