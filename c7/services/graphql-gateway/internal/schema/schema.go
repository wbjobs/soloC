package schema

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"github.com/graphql-go/graphql"
)

type FederatedService struct {
	Name    string
	URL     string
}

type GatewayConfig struct {
	Services []*FederatedService
}

type GatewaySchema struct {
	config *GatewayConfig
	client *http.Client
}

func NewGatewaySchema(config *GatewayConfig) *GatewaySchema {
	return &GatewaySchema{
		config: config,
		client: &http.Client{
			Timeout: 30 * 1000000000,
		},
	}
}

func (gs *GatewaySchema) BuildSchema() (graphql.Schema, error) {
	warehouseType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Warehouse",
		Fields: graphql.Fields{
			"id": &graphql.Field{
				Type: graphql.String,
			},
			"name": &graphql.Field{
				Type: graphql.String,
			},
			"stock": &graphql.Field{
				Type: graphql.Int,
			},
			"location": &graphql.Field{
				Type: graphql.String,
			},
		},
	})

	inventoryType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Inventory",
		Fields: graphql.Fields{
			"total": &graphql.Field{
				Type: graphql.Int,
			},
			"warehouse": &graphql.Field{
				Type: graphql.NewList(warehouseType),
			},
		},
	})

	priceType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Price",
		Fields: graphql.Fields{
			"base_price": &graphql.Field{
				Type: graphql.Float,
			},
			"base_currency": &graphql.Field{
				Type: graphql.String,
			},
			"usd": &graphql.Field{
				Type: graphql.Float,
			},
			"eur": &graphql.Field{
				Type: graphql.Float,
			},
			"cny": &graphql.Field{
				Type: graphql.Float,
			},
			"jpy": &graphql.Field{
				Type: graphql.Float,
			},
			"gbp": &graphql.Field{
				Type: graphql.Float,
			},
		},
	})

	dynamicPricingStatusType := graphql.NewObject(graphql.ObjectConfig{
		Name: "DynamicPricingStatus",
		Fields: graphql.Fields{
			"success": &graphql.Field{
				Type: graphql.Boolean,
			},
			"message": &graphql.Field{
				Type: graphql.String,
			},
			"enabled": &graphql.Field{
				Type: graphql.Boolean,
			},
			"low_stock_threshold": &graphql.Field{
				Type: graphql.Int,
			},
			"max_multiplier": &graphql.Field{
				Type: graphql.Float,
			},
		},
	})

	productType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Product",
		Fields: graphql.Fields{
			"id": &graphql.Field{
				Type: graphql.String,
			},
			"price": &graphql.Field{
				Type: priceType,
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					var productID string
					switch v := p.Source.(type) {
					case map[string]interface{}:
						if id, ok := v["id"].(string); ok {
							productID = id
						}
					}

					if productID == "" {
						return nil, fmt.Errorf("product id is required")
					}

					return gs.queryPriceService(context.Background(), productID)
				},
			},
			"inventory": &graphql.Field{
				Type: inventoryType,
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					var productID string
					switch v := p.Source.(type) {
					case map[string]interface{}:
						if id, ok := v["id"].(string); ok {
							productID = id
						}
					}

					if productID == "" {
						return nil, fmt.Errorf("product id is required")
					}

					return gs.queryInventoryService(context.Background(), productID)
				},
			},
		},
	})

	queryType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Query",
		Fields: graphql.Fields{
			"product": &graphql.Field{
				Type: productType,
				Args: graphql.FieldConfigArgument{
					"id": &graphql.ArgumentConfig{
						Type: graphql.NewNonNull(graphql.String),
					},
				},
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					productID := p.Args["id"].(string)

					var wg sync.WaitGroup
					var priceData map[string]interface{}
					var inventoryData map[string]interface{}
					var priceErr, inventoryErr error

					wg.Add(2)

					go func() {
						defer wg.Done()
						priceData, priceErr = gs.queryPriceService(p.Context, productID)
					}()

					go func() {
						defer wg.Done()
						inventoryData, inventoryErr = gs.queryInventoryService(p.Context, productID)
					}()

					wg.Wait()

					if priceErr != nil {
						return nil, priceErr
					}
					if inventoryErr != nil {
						return nil, inventoryErr
					}

					return map[string]interface{}{
						"id":        productID,
						"price":     priceData,
						"inventory": inventoryData,
					}, nil
				},
			},
			"dynamicPricingStatus": &graphql.Field{
				Type: dynamicPricingStatusType,
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					return gs.queryDynamicPricingStatus(p.Context)
				},
			},
			"_services": &graphql.Field{
				Type: graphql.NewObject(graphql.ObjectConfig{
					Name: "_Services",
					Fields: graphql.Fields{
						"serviceList": &graphql.Field{
							Type: graphql.NewList(graphql.NewObject(graphql.ObjectConfig{
								Name: "_Service",
								Fields: graphql.Fields{
									"name": &graphql.Field{
										Type: graphql.String,
									},
									"url": &graphql.Field{
										Type: graphql.String,
									},
								},
							})),
						},
					},
				}),
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					serviceList := make([]map[string]interface{}, 0, len(gs.config.Services))
					for _, svc := range gs.config.Services {
						serviceList = append(serviceList, map[string]interface{}{
							"name": svc.Name,
							"url":  svc.URL,
						})
					}
					return map[string]interface{}{
						"serviceList": serviceList,
					}, nil
				},
			},
		},
	})

	mutationType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Mutation",
		Fields: graphql.Fields{
			"updateDynamicPricing": &graphql.Field{
				Type: dynamicPricingStatusType,
				Args: graphql.FieldConfigArgument{
					"enabled": &graphql.ArgumentConfig{
						Type: graphql.NewNonNull(graphql.Boolean),
					},
				},
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					enabled := p.Args["enabled"].(bool)
					return gs.updateDynamicPricing(p.Context, enabled)
				},
			},
		},
	})

	return graphql.NewSchema(graphql.SchemaConfig{
		Query:    queryType,
		Mutation: mutationType,
	})
}

type GraphQLRequest struct {
	Query         string                 `json:"query"`
	OperationName string                 `json:"operationName,omitempty"`
	Variables     map[string]interface{} `json:"variables,omitempty"`
}

type GraphQLResponse struct {
	Data   interface{}   `json:"data"`
	Errors []interface{} `json:"errors,omitempty"`
}

func (gs *GatewaySchema) getService(name string) *FederatedService {
	for _, svc := range gs.config.Services {
		if svc.Name == name {
			return svc
		}
	}
	return nil
}

func (gs *GatewaySchema) queryPriceService(ctx context.Context, productID string) (map[string]interface{}, error) {
	priceService := gs.getService("price")
	if priceService == nil {
		return nil, fmt.Errorf("price service not configured")
	}

	query := fmt.Sprintf(`{
		product(id: "%s") {
			price {
				base_price
				base_currency
				usd
				eur
				cny
				jpy
				gbp
			}
		}
	}`, productID)

	reqBody := GraphQLRequest{
		Query: query,
	}

	result, err := gs.executeGraphQLRequest(ctx, priceService.URL, reqBody)
	if err != nil {
		return nil, err
	}

	dataMap, ok := result.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	productMap, ok := dataMap["product"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("product not found in response")
	}

	priceMap, _ := productMap["price"].(map[string]interface{})
	return priceMap, nil
}

func (gs *GatewaySchema) queryInventoryService(ctx context.Context, productID string) (map[string]interface{}, error) {
	inventoryService := gs.getService("inventory")
	if inventoryService == nil {
		return nil, fmt.Errorf("inventory service not configured")
	}

	query := fmt.Sprintf(`{
		product(id: "%s") {
			inventory {
				total
				warehouse {
					id
					name
					stock
					location
				}
			}
		}
	}`, productID)

	reqBody := GraphQLRequest{
		Query: query,
	}

	result, err := gs.executeGraphQLRequest(ctx, inventoryService.URL, reqBody)
	if err != nil {
		return nil, err
	}

	dataMap, ok := result.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	productMap, ok := dataMap["product"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("product not found in response")
	}

	inventoryMap, _ := productMap["inventory"].(map[string]interface{})
	return inventoryMap, nil
}

func (gs *GatewaySchema) queryDynamicPricingStatus(ctx context.Context) (map[string]interface{}, error) {
	priceService := gs.getService("price")
	if priceService == nil {
		return nil, fmt.Errorf("price service not configured")
	}

	query := `{
		dynamicPricingStatus {
			success
			message
			enabled
			low_stock_threshold
			max_multiplier
		}
	}`

	reqBody := GraphQLRequest{
		Query: query,
	}

	result, err := gs.executeGraphQLRequest(ctx, priceService.URL, reqBody)
	if err != nil {
		return nil, err
	}

	dataMap, ok := result.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	statusMap, _ := dataMap["dynamicPricingStatus"].(map[string]interface{})
	return statusMap, nil
}

func (gs *GatewaySchema) updateDynamicPricing(ctx context.Context, enabled bool) (map[string]interface{}, error) {
	priceService := gs.getService("price")
	if priceService == nil {
		return nil, fmt.Errorf("price service not configured")
	}

	enabledStr := "false"
	if enabled {
		enabledStr = "true"
	}

	query := fmt.Sprintf(`mutation {
		updateDynamicPricing(enabled: %s) {
			success
			message
			enabled
			low_stock_threshold
			max_multiplier
		}
	}`, enabledStr)

	reqBody := GraphQLRequest{
		Query: query,
	}

	result, err := gs.executeGraphQLRequest(ctx, priceService.URL, reqBody)
	if err != nil {
		return nil, err
	}

	dataMap, ok := result.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format")
	}

	statusMap, _ := dataMap["updateDynamicPricing"].(map[string]interface{})
	return statusMap, nil
}

func (gs *GatewaySchema) executeGraphQLRequest(ctx context.Context, url string, reqBody GraphQLRequest) (interface{}, error) {
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := gs.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var gqlResp GraphQLResponse
	if err := json.NewDecoder(resp.Body).Decode(&gqlResp); err != nil {
		return nil, err
	}

	if gqlResp.Errors != nil && len(gqlResp.Errors) > 0 {
		return nil, fmt.Errorf("graphql errors: %v", gqlResp.Errors)
	}

	return gqlResp.Data, nil
}
