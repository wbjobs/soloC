package service

import (
	"context"
	"sync"

	common "e-commerce-inventory-price/proto/common"
	inventorypb "e-commerce-inventory-price/proto/inventory"
	pb "e-commerce-inventory-price/proto/price"
	"e-commerce-inventory-price/services/price-service/internal/model"
	"e-commerce-inventory-price/services/price-service/internal/pricing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type PriceServiceImpl struct {
	pb.UnimplementedPriceServiceServer
	exchangeRate     *ExchangeRateService
	dynamicPricing   *pricing.DynamicPricingEngine
	inventoryClient  inventorypb.InventoryServiceClient
	mu               sync.RWMutex
}

func NewPriceServiceImpl(inventoryClient inventorypb.InventoryServiceClient) *PriceServiceImpl {
	return &PriceServiceImpl{
		exchangeRate:    NewExchangeRateService(),
		dynamicPricing:  pricing.NewDynamicPricingEngine(),
		inventoryClient: inventoryClient,
	}
}

func (s *PriceServiceImpl) UpdateDynamicPricing(ctx context.Context, req *pb.UpdateDynamicPricingRequest) (*pb.UpdateDynamicPricingResponse, error) {
	if req.Enabled {
		s.dynamicPricing.Enable()
	} else {
		s.dynamicPricing.Disable()
	}

	config := s.dynamicPricing.GetConfig()

	return &pb.UpdateDynamicPricingResponse{
		Success: true,
		Message: "dynamic pricing updated",
		Enabled: config.Enabled,
	}, nil
}

func (s *PriceServiceImpl) GetDynamicPricingStatus(ctx context.Context, req *pb.GetDynamicPricingStatusRequest) (*pb.GetDynamicPricingStatusResponse, error) {
	config := s.dynamicPricing.GetConfig()

	return &pb.GetDynamicPricingStatusResponse{
		Enabled:           config.Enabled,
		LowStockThreshold: config.LowStockThreshold,
		MaxMultiplier:     config.MaxPriceMultiplier,
	}, nil
}

func (s *PriceServiceImpl) getProductStock(ctx context.Context, productID string) int32 {
	if s.inventoryClient == nil {
		return 100
	}

	resp, err := s.inventoryClient.GetInventory(ctx, &common.Product{Id: productID})
	if err != nil {
		return 100
	}

	return resp.Total
}

func (s *PriceServiceImpl) calculatePriceWithDynamicPricing(ctx context.Context, productID string, basePrice float64, baseCurrency string) (float64, string) {
	stock := s.getProductStock(ctx, productID)
	dynamicPrice, reason := s.dynamicPricing.CalculateDynamicPrice(productID, basePrice, stock)
	return dynamicPrice, reason
}

func (s *PriceServiceImpl) GetPrice(ctx context.Context, req *common.Product) (*pb.PriceResponse, error) {
	price := model.GetPrice(req.Id)
	if price == nil {
		return nil, status.Errorf(codes.NotFound, "product not found: %s", req.Id)
	}

	effectivePrice, _ := s.calculatePriceWithDynamicPricing(ctx, req.Id, price.BasePrice, price.BaseCurrency)

	convertedPrices := make(map[string]float64)
	targetCurrencies := []string{"USD", "EUR", "CNY", "JPY", "GBP"}

	for _, currency := range targetCurrencies {
		if currency == price.BaseCurrency {
			convertedPrices[currency] = effectivePrice
			continue
		}

		converted, err := s.exchangeRate.Convert(effectivePrice, price.BaseCurrency, currency)
		if err == nil {
			convertedPrices[currency] = converted
		}
	}

	return &pb.PriceResponse{
		BasePrice:       price.BasePrice,
		BaseCurrency:    price.BaseCurrency,
		ConvertedPrices: convertedPrices,
	}, nil
}

func (s *PriceServiceImpl) GetPriceInCurrency(ctx context.Context, req *pb.GetPriceInCurrencyRequest) (*pb.PriceResponse, error) {
	price := model.GetPrice(req.ProductId)
	if price == nil {
		return nil, status.Errorf(codes.NotFound, "product not found: %s", req.ProductId)
	}

	effectivePrice, _ := s.calculatePriceWithDynamicPricing(ctx, req.ProductId, price.BasePrice, price.BaseCurrency)

	convertedPrices := make(map[string]float64)
	targetCurrencies := req.TargetCurrencies
	if len(targetCurrencies) == 0 {
		targetCurrencies = []string{"USD", "EUR"}
	}

	for _, currency := range targetCurrencies {
		if currency == price.BaseCurrency {
			convertedPrices[currency] = effectivePrice
			continue
		}

		converted, err := s.exchangeRate.Convert(effectivePrice, price.BaseCurrency, currency)
		if err == nil {
			convertedPrices[currency] = converted
		}
	}

	return &pb.PriceResponse{
		BasePrice:       price.BasePrice,
		BaseCurrency:    price.BaseCurrency,
		ConvertedPrices: convertedPrices,
	}, nil
}

func (s *PriceServiceImpl) GetPriceWithMetrics(ctx context.Context, req *pb.GetPriceInCurrencyRequest) (*pb.PriceWithMetricsResponse, error) {
	price := model.GetPrice(req.ProductId)
	if price == nil {
		return nil, status.Errorf(codes.NotFound, "product not found: %s", req.ProductId)
	}

	stock := s.getProductStock(ctx, req.ProductId)
	effectivePrice, reason := s.dynamicPricing.CalculateDynamicPrice(req.ProductId, price.BasePrice, stock)

	convertedPrices := make(map[string]float64)
	targetCurrencies := req.TargetCurrencies
	if len(targetCurrencies) == 0 {
		targetCurrencies = []string{"USD", "EUR"}
	}

	for _, currency := range targetCurrencies {
		if currency == price.BaseCurrency {
			convertedPrices[currency] = effectivePrice
			continue
		}

		converted, err := s.exchangeRate.Convert(effectivePrice, price.BaseCurrency, currency)
		if err == nil {
			convertedPrices[currency] = converted
		}
	}

	metrics := s.dynamicPricing.GetPricingMetrics(req.ProductId)
	metricsMap := make(map[string]float64)
	if metrics != nil {
		if v, ok := metrics["sales_velocity"].(float64); ok {
			metricsMap["sales_velocity"] = v
		}
		if v, ok := metrics["current_stock"].(int32); ok {
			metricsMap["current_stock"] = float64(v)
		}
		if v, ok := metrics["threshold"].(int32); ok {
			metricsMap["threshold"] = float64(v)
		}
	}

	return &pb.PriceWithMetricsResponse{
		BasePrice:       price.BasePrice,
		DynamicPrice:    effectivePrice,
		BaseCurrency:    price.BaseCurrency,
		ConvertedPrices: convertedPrices,
		PricingReason:   reason,
		IsDynamic:       s.dynamicPricing.IsEnabled(),
		Metrics:         metricsMap,
	}, nil
}

func (s *PriceServiceImpl) GetDynamicPricingEngine() *pricing.DynamicPricingEngine {
	return s.dynamicPricing
}
