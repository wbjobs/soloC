package service

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"sync"
	"time"

	common "e-commerce-inventory-price/proto/common"
	pb "e-commerce-inventory-price/proto/inventory"
	"e-commerce-inventory-price/services/inventory-service/internal/cache"
	"e-commerce-inventory-price/services/inventory-service/internal/consistent"
	"e-commerce-inventory-price/services/inventory-service/internal/model"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type InventoryServiceImpl struct {
	pb.UnimplementedInventoryServiceServer
	consistentHash *consistent.HashRing
	redlock        *cache.Redlock
	mu             sync.RWMutex
}

func NewInventoryServiceImpl(redisAddrs []string) *InventoryServiceImpl {
	return &InventoryServiceImpl{
		consistentHash: consistent.NewHashRing(redisAddrs, consistent.WithVirtualNodes(200)),
		redlock: cache.NewRedlock(
			redisAddrs,
			cache.WithRetryDelay(50*time.Millisecond),
			cache.WithRetryCount(20),
			cache.WithLockTTL(5*time.Second),
			cache.WithDriftFactor(0.1),
		),
	}
}

func (s *InventoryServiceImpl) cacheKey(productID string) string {
	return fmt.Sprintf("inventory:%s", productID)
}

func (s *InventoryServiceImpl) GetInventory(ctx context.Context, req *common.Product) (*pb.InventoryResponse, error) {
	cacheKey := s.cacheKey(req.Id)
	cached, err := s.consistentHash.Get(cacheKey)
	if err == nil && cached != "" {
		var cachedResp pb.InventoryResponse
		if err := json.Unmarshal([]byte(cached), &cachedResp); err == nil {
			return &cachedResp, nil
		}
	}

	inv := model.GetInventory(req.Id)
	if inv == nil {
		return nil, status.Errorf(codes.NotFound, "product not found: %s", req.Id)
	}

	warehouses := make([]*pb.Warehouse, 0, len(inv.Warehouses))
	for _, wh := range inv.Warehouses {
		warehouses = append(warehouses, &pb.Warehouse{
			Id:       wh.ID,
			Name:     wh.Name,
			Stock:    wh.Stock,
			Location: wh.Location,
		})
	}

	sort.Slice(warehouses, func(i, j int) bool {
		return warehouses[i].Id < warehouses[j].Id
	})

	resp := &pb.InventoryResponse{
		Total:      inv.Total,
		Warehouses: warehouses,
	}

	respBytes, _ := json.Marshal(resp)
	s.consistentHash.Set(cacheKey, string(respBytes), 5*time.Minute)

	return resp, nil
}

func (s *InventoryServiceImpl) ReserveInventory(ctx context.Context, req *pb.ReserveRequest) (*pb.ReserveResponse, error) {
	if req.Quantity <= 0 {
		return &pb.ReserveResponse{
			Success: false,
			Message: "quantity must be greater than 0",
		}, nil
	}

	lockKey := s.redlock.LockKey(req.ProductId)
	lock, err := s.redlock.Lock(lockKey)
	if err != nil {
		return &pb.ReserveResponse{
			Success: false,
			Message: "failed to acquire lock: " + err.Error(),
		}, nil
	}
	defer func() {
		_ = s.redlock.Unlock(lock)
	}()

	s.mu.Lock()
	defer s.mu.Unlock()

	inv := model.GetInventory(req.ProductId)
	if inv == nil {
		return &pb.ReserveResponse{
			Success: false,
			Message: "product not found: " + req.ProductId,
		}, nil
	}

	if inv.Total < req.Quantity {
		return &pb.ReserveResponse{
			Success: false,
			Message: "insufficient stock",
		}, nil
	}

	warehouseList := make([]*model.Warehouse, 0, len(inv.Warehouses))
	for _, wh := range inv.Warehouses {
		warehouseList = append(warehouseList, wh)
	}

	sort.Slice(warehouseList, func(i, j int) bool {
		return warehouseList[i].Stock > warehouseList[j].Stock
	})

	allocated := make(map[string]int32)
	remaining := req.Quantity

	for _, wh := range warehouseList {
		if remaining <= 0 {
			break
		}

		allocate := remaining
		if wh.Stock < allocate {
			allocate = wh.Stock
		}

		if model.UpdateStock(req.ProductId, wh.ID, allocate) {
			allocated[wh.ID] = allocate
			remaining -= allocate
		}
	}

	if remaining > 0 {
		return &pb.ReserveResponse{
			Success: false,
			Message: "failed to allocate sufficient stock",
		}, nil
	}

	s.consistentHash.Del(s.cacheKey(req.ProductId))

	allocatedNames := make(map[string]int32)
	for whID, qty := range allocated {
		if wh, ok := inv.Warehouses[whID]; ok {
			allocatedNames[wh.Name] = qty
		}
	}

	return &pb.ReserveResponse{
		Success:           true,
		Message:           "reservation successful",
		AllocatedWarehouses: allocatedNames,
	}, nil
}
