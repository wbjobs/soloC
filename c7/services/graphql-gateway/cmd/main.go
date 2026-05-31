package main

import (
	"log"
	"net/http"

	"e-commerce-inventory-price/services/graphql-gateway/internal/schema"

	"github.com/graphql-go/handler"
)

const (
	graphqlPort         = ":4000"
	priceGraphQLURL     = "http://localhost:4001/graphql"
	inventoryGraphQLURL = "http://localhost:4002/graphql"
)

func main() {
	config := &schema.GatewayConfig{
		Services: []*schema.FederatedService{
			{
				Name: "price",
				URL:  priceGraphQLURL,
			},
			{
				Name: "inventory",
				URL:  inventoryGraphQLURL,
			},
		},
	}

	gatewaySchema := schema.NewGatewaySchema(config)
	graphqlSchema, err := gatewaySchema.BuildSchema()
	if err != nil {
		log.Fatalf("failed to build schema: %v", err)
	}

	h := handler.New(&handler.Config{
		Schema:   &graphqlSchema,
		Pretty:   true,
		GraphiQL: true,
	})

	http.Handle("/graphql", h)

	log.Printf("GraphQL Federation Gateway starting on port %s", graphqlPort)
	log.Printf("GraphiQL available at http://localhost%s/graphql", graphqlPort)
	log.Printf("Federated Services:")
	log.Printf("  - Price Service: %s", priceGraphQLURL)
	log.Printf("  - Inventory Service: %s", inventoryGraphQLURL)

	if err := http.ListenAndServe(graphqlPort, nil); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
