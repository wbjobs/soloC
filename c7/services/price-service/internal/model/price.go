package model

type ProductPrice struct {
	ProductID    string  `json:"product_id"`
	BasePrice    float64 `json:"base_price"`
	BaseCurrency string  `json:"base_currency"`
}

var ProductPrices = map[string]*ProductPrice{
	"123": {
		ProductID:    "123",
		BasePrice:    99.99,
		BaseCurrency: "USD",
	},
	"456": {
		ProductID:    "456",
		BasePrice:    59.99,
		BaseCurrency: "EUR",
	},
	"789": {
		ProductID:    "789",
		BasePrice:    199.00,
		BaseCurrency: "USD",
	},
}

func GetPrice(productID string) *ProductPrice {
	return ProductPrices[productID]
}
