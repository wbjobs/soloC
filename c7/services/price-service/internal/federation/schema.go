package federation

import (
	"context"
	"fmt"

	pricepb "e-commerce-inventory-price/proto/price"
	"e-commerce-inventory-price/services/price-service/internal/model"

	"github.com/graphql-go/graphql"
)

type EntityReference struct {
	TypeName string                 `json:"__typename"`
	ID       string                 `json:"id"`
	Fields   map[string]interface{} `json:"-"`
}

type PriceService struct {
	priceClient pricepb.PriceServiceClient
}

func NewPriceService(client pricepb.PriceServiceClient) *PriceService {
	return &PriceService{
		priceClient: client,
	}
}

func (ps *PriceService) BuildSchema() (graphql.Schema, error) {
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
		IsTypeOf: func(p graphql.IsTypeOfParams) bool {
			_, ok := p.Value.(*pricepb.PriceResponse)
			return ok
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
				Type: graphql.NewNonNull(graphql.String),
			},
			"price": &graphql.Field{
				Type: priceType,
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					var productID string
					switch v := p.Source.(type) {
					case *EntityReference:
						productID = v.ID
					case map[string]interface{}:
						if id, ok := v["id"].(string); ok {
							productID = id
						}
					}

					if productID == "" {
						return nil, fmt.Errorf("product id is required")
					}

					return ps.priceClient.GetPriceInCurrency(context.Background(), &pricepb.GetPriceInCurrencyRequest{
						ProductId:        productID,
						TargetCurrencies: []string{"USD", "EUR", "CNY", "JPY", "GBP"},
					})
				},
			},
		},
		IsTypeOf: func(p graphql.IsTypeOfParams) bool {
			switch p.Value.(type) {
			case *EntityReference, map[string]interface{}:
				return true
			}
			return false
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
					price := model.GetPrice(productID)
					if price == nil {
						return nil, fmt.Errorf("product not found: %s", productID)
					}
					return map[string]interface{}{
						"id": productID,
					}, nil
				},
			},
			"dynamicPricingStatus": &graphql.Field{
				Type: dynamicPricingStatusType,
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					resp, err := ps.priceClient.GetDynamicPricingStatus(context.Background(), &pricepb.GetDynamicPricingStatusRequest{})
					if err != nil {
						return nil, err
					}

					return map[string]interface{}{
						"success":              true,
						"message":              "dynamic pricing status",
						"enabled":              resp.Enabled,
						"low_stock_threshold":  resp.LowStockThreshold,
						"max_multiplier":       resp.MaxMultiplier,
					}, nil
				},
			},
			"_entities": &graphql.Field{
				Type: graphql.NewList(graphql.NewNonNull(productType)),
				Args: graphql.FieldConfigArgument{
					"representations": &graphql.ArgumentConfig{
						Type: graphql.NewNonNull(graphql.NewList(graphql.NewNonNull(graphql.String))),
					},
				},
				Resolve: ps.resolveEntities,
			},
			"_service": &graphql.Field{
				Type: graphql.NewObject(graphql.ObjectConfig{
					Name: "_Service",
					Fields: graphql.Fields{
						"sdl": &graphql.Field{
							Type: graphql.String,
						},
					},
				}),
				Resolve: func(p graphql.ResolveParams) (interface{}, error) {
					return map[string]interface{}{
						"sdl": buildSDL(),
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

					resp, err := ps.priceClient.UpdateDynamicPricing(context.Background(), &pricepb.UpdateDynamicPricingRequest{
						Enabled: enabled,
					})
					if err != nil {
						return nil, err
					}

					statusResp, err := ps.priceClient.GetDynamicPricingStatus(context.Background(), &pricepb.GetDynamicPricingStatusRequest{})
					if err != nil {
						return map[string]interface{}{
							"success": resp.Success,
							"message": resp.Message,
							"enabled": resp.Enabled,
						}, nil
					}

					return map[string]interface{}{
						"success":              resp.Success,
						"message":              resp.Message,
						"enabled":              resp.Enabled,
						"low_stock_threshold":  statusResp.LowStockThreshold,
						"max_multiplier":       statusResp.MaxMultiplier,
					}, nil
				},
			},
		},
	})

	return graphql.NewSchema(graphql.SchemaConfig{
		Query:    queryType,
		Mutation: mutationType,
	})
}

func (ps *PriceService) resolveEntities(p graphql.ResolveParams) (interface{}, error) {
	rawReps := p.Args["representations"].([]interface{})
	results := make([]interface{}, 0, len(rawReps))

	for _, raw := range rawReps {
		rep, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}

		typeName, _ := rep["__typename"].(string)
		if typeName != "Product" {
			results = append(results, nil)
			continue
		}

		id, _ := rep["id"].(string)
		price := model.GetPrice(id)
		if price == nil {
			results = append(results, nil)
			continue
		}

		results = append(results, &EntityReference{
			TypeName: "Product",
			ID:       id,
		})
	}

	return results, nil
}

func buildSDL() string {
	return `
extend type Query {
  product(id: ID!): Product
  dynamicPricingStatus: DynamicPricingStatus
}

extend type Mutation {
  updateDynamicPricing(enabled: Boolean!): DynamicPricingStatus
}

extend type Product @key(fields: "id") {
  id: ID! @external
  price: Price
}

type Price {
  base_price: Float
  base_currency: String
  usd: Float
  eur: Float
  cny: Float
  jpy: Float
  gbp: Float
}

type DynamicPricingStatus {
  success: Boolean
  message: String
  enabled: Boolean
  low_stock_threshold: Int
  max_multiplier: Float
}
`
}
