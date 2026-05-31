package model

type Warehouse struct {
	ID       string
	Name     string
	Location string
	Stock    int32
}

type ProductInventory struct {
	ProductID  string
	Warehouses map[string]*Warehouse
	Total      int32
}

var ProductInventoryData = map[string]*ProductInventory{
	"123": {
		ProductID: "123",
		Warehouses: map[string]*Warehouse{
			"wh1": {ID: "wh1", Name: "上海仓", Location: "Shanghai", Stock: 100},
			"wh2": {ID: "wh2", Name: "深圳仓", Location: "Shenzhen", Stock: 200},
			"wh3": {ID: "wh3", Name: "成都仓", Location: "Chengdu", Stock: 50},
		},
		Total: 350,
	},
	"456": {
		ProductID: "456",
		Warehouses: map[string]*Warehouse{
			"wh1": {ID: "wh1", Name: "上海仓", Location: "Shanghai", Stock: 50},
			"wh2": {ID: "wh2", Name: "深圳仓", Location: "Shenzhen", Stock: 75},
			"wh3": {ID: "wh3", Name: "成都仓", Location: "Chengdu", Stock: 25},
		},
		Total: 150,
	},
	"789": {
		ProductID: "789",
		Warehouses: map[string]*Warehouse{
			"wh1": {ID: "wh1", Name: "上海仓", Location: "Shanghai", Stock: 30},
			"wh2": {ID: "wh2", Name: "深圳仓", Location: "Shenzhen", Stock: 20},
			"wh3": {ID: "wh3", Name: "成都仓", Location: "Chengdu", Stock: 10},
		},
		Total: 60,
	},
}

func GetInventory(productID string) *ProductInventory {
	return ProductInventoryData[productID]
}

func UpdateStock(productID, warehouseID string, quantity int32) bool {
	inv := ProductInventoryData[productID]
	if inv == nil {
		return false
	}

	wh := inv.Warehouses[warehouseID]
	if wh == nil || wh.Stock < quantity {
		return false
	}

	wh.Stock -= quantity
	inv.Total -= quantity
	return true
}
