package federation

import (
	"context"
	"fmt"

	commonpb "e-commerce-inventory-price/proto/common"
	inventorypb "e-commerce-inventory-price/proto/inventory"
	"e-commerce-inventory-price/services/inventory-service/internal/model"

	"github.com/graphql-go/graphql"
)

type EntityReference struct {
	TypeName string                 `json:"__typename"`
	ID       string                 `json:"id"`
	Fields   map[string]interface{} `json:"-"`
}

type InventoryService struct {
	inventoryClient inventorypb.InventoryServiceClient
}

func NewInventoryService(client inventorypb.InventoryServiceClient) *InventoryService {
	return &InventoryService{
		inventoryClient: client,
	}
}

func (is *InventoryService) BuildSchema() (graphql.Schema, error) {
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

	productType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Product",
		Fields: graphql.Fields{
			"id": &graphql.Field{
				Type: graphql.NewNonNull(graphql.String),
			},
			"inventory": &graphql.Field{
				Type: inventoryType,
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

					return is.inventoryClient.GetInventory(context.Background(), &commonpb.Product{
						Id: productID,
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
					inv := model.GetInventory(productID)
					if inv == nil {
						return nil, fmt.Errorf("product not found: %s", productID)
					}
					return map[string]interface{}{
						"id": productID,
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
				Resolve: is.resolveEntities,
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

	return graphql.NewSchema(graphql.SchemaConfig{
		Query: queryType,
	})
}

func (is *InventoryService) resolveEntities(p graphql.ResolveParams) (interface{}, error) {
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
		inv := model.GetInventory(id)
		if inv == nil {
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
}

extend type Product @key(fields: "id") {
  id: ID! @external
  inventory: Inventory
}

type Inventory {
  total: Int
  warehouse: [Warehouse!]!
}

type Warehouse {
  id: ID
  name: String
  stock: Int
  location: String
}
`
}
