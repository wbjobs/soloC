package pricing

import (
	"fmt"
	"math"
	"sync"
	"time"
)

type DynamicPricingConfig struct {
	Enabled            bool
	LowStockThreshold  int32
	MaxPriceMultiplier  float64
	PriceIncreaseRate  float64
	HistoryWeight      float64
	StockWeight        float64
}

type SalesHistory struct {
	ProductID    string
	DailySales   []int32
	Last7Days    int32
	Last30Days   int32
	Velocity     float64
}

type ProductPricingData struct {
	BasePrice       float64
	CurrentStock    int32
	SalesHistory    *SalesHistory
	LastPriceAdjust time.Time
}

type DynamicPricingEngine struct {
	config        DynamicPricingConfig
	configMu      sync.RWMutex
	pricingData   map[string]*ProductPricingData
	dataMu        sync.RWMutex
	defaultConfig DynamicPricingConfig
}

func DefaultConfig() DynamicPricingConfig {
	return DynamicPricingConfig{
		Enabled:            false,
		LowStockThreshold:  50,
		MaxPriceMultiplier: 2.0,
		PriceIncreaseRate:  0.05,
		HistoryWeight:      0.6,
		StockWeight:        0.4,
	}
}

func NewDynamicPricingEngine() *DynamicPricingEngine {
	return &DynamicPricingEngine{
		config:        DefaultConfig(),
		pricingData:   make(map[string]*ProductPricingData),
		defaultConfig: DefaultConfig(),
	}
}

func (e *DynamicPricingEngine) Enable() {
	e.configMu.Lock()
	defer e.configMu.Unlock()
	e.config.Enabled = true
}

func (e *DynamicPricingEngine) Disable() {
	e.configMu.Lock()
	defer e.configMu.Unlock()
	e.config.Enabled = false
}

func (e *DynamicPricingEngine) IsEnabled() bool {
	e.configMu.RLock()
	defer e.configMu.RUnlock()
	return e.config.Enabled
}

func (e *DynamicPricingEngine) SetConfig(config DynamicPricingConfig) {
	e.configMu.Lock()
	defer e.configMu.Unlock()
	e.config = config
}

func (e *DynamicPricingEngine) GetConfig() DynamicPricingConfig {
	e.configMu.RLock()
	defer e.configMu.RUnlock()
	return e.config
}

func (e *DynamicPricingEngine) UpdateProductData(productID string, basePrice float64, currentStock int32) {
	e.dataMu.Lock()
	defer e.dataMu.Unlock()

	existing, ok := e.pricingData[productID]
	if !ok {
		existing = &ProductPricingData{
			BasePrice:    basePrice,
			CurrentStock: currentStock,
			SalesHistory: e.generateMockSalesHistory(productID),
		}
		e.pricingData[productID] = existing
	} else {
		existing.BasePrice = basePrice
		existing.CurrentStock = currentStock
	}
}

func (e *DynamicPricingEngine) generateMockSalesHistory(productID string) *SalesHistory {
	baseVelocity := 2.0
	switch productID {
	case "123":
		baseVelocity = 10.0
	case "456":
		baseVelocity = 5.0
	case "789":
		baseVelocity = 1.0
	}

	return &SalesHistory{
		ProductID:  productID,
		Last7Days:  int32(baseVelocity * 7),
		Last30Days: int32(baseVelocity * 30),
		Velocity:   baseVelocity,
	}
}

func (e *DynamicPricingEngine) CalculateDynamicPrice(productID string, basePrice float64, currentStock int32) (float64, string) {
	if !e.IsEnabled() {
		return basePrice, "dynamic_pricing_disabled"
	}

	e.UpdateProductData(productID, basePrice, currentStock)

	e.dataMu.RLock()
	data := e.pricingData[productID]
	e.dataMu.RUnlock()

	if data == nil {
		return basePrice, "no_pricing_data"
	}

	config := e.GetConfig()

	if currentStock >= config.LowStockThreshold {
		return basePrice, "stock_above_threshold"
	}

	stockRatio := float64(currentStock) / float64(config.LowStockThreshold)
	demandScore := data.SalesHistory.Velocity / 10.0
	if demandScore > 1.0 {
		demandScore = 1.0
	}

	stockFactor := (1.0 - stockRatio) * config.StockWeight
	demandFactor := demandScore * config.HistoryWeight
	combinedScore := stockFactor + demandFactor

	priceIncrease := combinedScore * config.PriceIncreaseRate * 100
	priceMultiplier := 1.0 + priceIncrease

	if priceMultiplier > config.MaxPriceMultiplier {
		priceMultiplier = config.MaxPriceMultiplier
	}

	if priceMultiplier < 1.0 {
		priceMultiplier = 1.0
	}

	dynamicPrice := basePrice * priceMultiplier
	dynamicPrice = math.Round(dynamicPrice*100) / 100

	return dynamicPrice, e.formatPriceReason(stockRatio, demandScore, priceMultiplier)
}

func (e *DynamicPricingEngine) formatPriceReason(stockRatio, demandScore, priceMultiplier float64) string {
	if priceMultiplier == 1.0 {
		return "base_price"
	}

	stockPct := int((1.0 - stockRatio) * 100)
	demandPct := int(demandScore * 100)
	increasePct := int((priceMultiplier - 1.0) * 100)

	return fmt.Sprintf("low_stock_%d%%_demand_%d%%_increase_%d%%", stockPct, demandPct, increasePct)
}

func (e *DynamicPricingEngine) GetPricingMetrics(productID string) map[string]interface{} {
	e.dataMu.RLock()
	data := e.pricingData[productID]
	e.dataMu.RUnlock()

	if data == nil {
		return nil
	}

	config := e.GetConfig()

	return map[string]interface{}{
		"enabled":              config.Enabled,
		"base_price":           data.BasePrice,
		"current_stock":        data.CurrentStock,
		"threshold":            config.LowStockThreshold,
		"sales_velocity":       data.SalesHistory.Velocity,
		"sales_last_7_days":    data.SalesHistory.Last7Days,
		"sales_last_30_days":   data.SalesHistory.Last30Days,
		"max_multiplier":       config.MaxPriceMultiplier,
		"stock_weight":         config.StockWeight,
		"demand_weight":        config.HistoryWeight,
		"last_adjustment":      data.LastPriceAdjust,
	}
}

func (e *DynamicPricingEngine) UpdateSalesVelocity(productID string, newVelocity float64) {
	e.dataMu.Lock()
	defer e.dataMu.Unlock()

	data := e.pricingData[productID]
	if data == nil {
		return
	}

	data.SalesHistory.Velocity = newVelocity
	data.SalesHistory.Last7Days = int32(newVelocity * 7)
	data.SalesHistory.Last30Days = int32(newVelocity * 30)
}
