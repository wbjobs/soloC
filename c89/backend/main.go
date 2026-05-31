package main

import (
	"log"
	"net/http"
	"space-drone-game/backend/game"
	"space-drone-game/backend/websocket"
)

func main() {
	gameManager := game.NewGameManager()
	hub := websocket.NewHub(gameManager)
	go hub.Run()
	go hub.StartBroadcastLoop()

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		websocket.ServeWs(hub, w, r)
	})

	fs := http.FileServer(http.Dir("../frontend"))
	http.Handle("/", fs)

	log.Println("服务器启动在 :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal("服务器启动失败:", err)
	}
}
