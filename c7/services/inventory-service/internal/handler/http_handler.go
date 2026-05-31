package handler

import (
	"context"
	"encoding/json"
	"net/http"

	pb "e-commerce-inventory-price/proto/inventory"
)

type ReserveRequest struct {
	ProductID string `json:"product_id"`
	Quantity  int32  `json:"quantity"`
	OrderID   string `json:"order_id"`
}

type ReserveResponse struct {
	Success             bool           `json:"success"`
	Message             string         `json:"message"`
	AllocatedWarehouses map[string]int32 `json:"allocated_warehouses"`
}

type HTTPHandler struct {
	inventoryClient pb.InventoryServiceClient
}

func NewHTTPHandler(client pb.InventoryServiceClient) *HTTPHandler {
	return &HTTPHandler{
		inventoryClient: client,
	}
}

func (h *HTTPHandler) Reserve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ReserveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.ProductID == "" {
		http.Error(w, "product_id is required", http.StatusBadRequest)
		return
	}

	if req.Quantity <= 0 {
		http.Error(w, "quantity must be greater than 0", http.StatusBadRequest)
		return
	}

	grpcResp, err := h.inventoryClient.ReserveInventory(context.Background(), &pb.ReserveRequest{
		ProductId: req.ProductID,
		Quantity:  req.Quantity,
		OrderId:   req.OrderID,
	})

	if err != nil {
		http.Error(w, "reservation failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	resp := ReserveResponse{
		Success:             grpcResp.Success,
		Message:             grpcResp.Message,
		AllocatedWarehouses: grpcResp.AllocatedWarehouses,
	}

	w.Header().Set("Content-Type", "application/json")
	if !resp.Success {
		w.WriteHeader(http.StatusConflict)
	}

	json.NewEncoder(w).Encode(resp)
}
