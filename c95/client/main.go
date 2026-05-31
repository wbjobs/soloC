package main

import (
	"snippet-cli/cmd"
	"snippet-cli/internal/storage"
)

func main() {
	storage.InitDB()
	cmd.Execute()
}
