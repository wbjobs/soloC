package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

func serverA() {
	http.HandleFunc("/api/serviceA", func(w http.ResponseWriter, r *http.Request) {
		log.Println("[ServiceA] Received request")

		// Diamond pattern: A -> B, A -> C, both -> D
		resp1, _ := http.Get("http://localhost:8002/api/serviceB")
		if resp1 != nil { resp1.Body.Close() }

		resp2, _ := http.Get("http://localhost:8003/api/serviceC")
		if resp2 != nil { resp2.Body.Close() }

		fmt.Fprintf(w, "ServiceA processed request")
	})

	log.Println("ServiceA starting on :8001")
	http.ListenAndServe(":8001", nil)
}

func serverB() {
	http.HandleFunc("/api/serviceB", func(w http.ResponseWriter, r *http.Request) {
		log.Println("[ServiceB] Received request")

		// B -> D
		resp, _ := http.Get("http://localhost:8004/api/serviceD")
		if resp != nil { resp.Body.Close() }

		// High latency simulation
		time.Sleep(600 * time.Millisecond)
		fmt.Fprintf(w, "ServiceB processed request")
	})

	log.Println("ServiceB starting on :8002")
	http.ListenAndServe(":8002", nil)
}

func serverC() {
	http.HandleFunc("/api/serviceC", func(w http.ResponseWriter, r *http.Request) {
		log.Println("[ServiceC] Received request")

		// C -> D
		resp, _ := http.Get("http://localhost:8004/api/serviceD")
		if resp != nil { resp.Body.Close() }

		fmt.Fprintf(w, "ServiceC processed request")
	})

	log.Println("ServiceC starting on :8003")
	http.ListenAndServe(":8003", nil)
}

func serverD() {
	http.HandleFunc("/api/serviceD", func(w http.ResponseWriter, r *http.Request) {
		log.Println("[ServiceD] Received request")
		fmt.Fprintf(w, "ServiceD processed request")
	})

	log.Println("ServiceD starting on :8004")
	http.ListenAndServe(":8004", nil)
}

// Cycle detection: E -> F -> G -> E
func serverE() {
	http.HandleFunc("/api/serviceE", func(w http.ResponseWriter, r *http.Request) {
		log.Println("[ServiceE] Received request")
		// E -> F
		resp, _ := http.Get("http://localhost:8006/api/serviceF")
		if resp != nil { resp.Body.Close() }
		fmt.Fprintf(w, "ServiceE processed request")
	})

	log.Println("ServiceE starting on :8005")
	http.ListenAndServe(":8005", nil)
}

func serverF() {
	http.HandleFunc("/api/serviceF", func(w http.ResponseWriter, r *http.Request) {
		log.Println("[ServiceF] Received request")
		// F -> G
		resp, _ := http.Get("http://localhost:8007/api/serviceG")
		if resp != nil { resp.Body.Close() }
		fmt.Fprintf(w, "ServiceF processed request")
	})

	log.Println("ServiceF starting on :8006")
	http.ListenAndServe(":8006", nil)
}

func serverG() {
	http.HandleFunc("/api/serviceG", func(w http.ResponseWriter, r *http.Request) {
		log.Println("[ServiceG] Received request")
		// G -> E (cycle!)
		resp, _ := http.Get("http://localhost:8005/api/serviceE")
		if resp != nil { resp.Body.Close() }
		fmt.Fprintf(w, "ServiceG processed request")
	})

	log.Println("ServiceG starting on :8007")
	http.ListenAndServe(":8007", nil)
}

// High fanout service: H -> 15 services
func serverH() {
	for i := 1; i <= 15; i++ {
		port := 8100 + i
		go func(p int) {
			http.HandleFunc(fmt.Sprintf("/api/endpoint%d", p-8100), func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(200)
			})
			log.Printf("Endpoint %d starting on :%d", p-8100, p)
		}(port)
	}

	http.HandleFunc("/api/serviceH", func(w http.ResponseWriter, r *http.Request) {
		log.Println("[ServiceH] Received request - high fanout")

		// Call 15 downstream services
		for i := 1; i <= 15; i++ {
			port := 8100 + i
			resp, _ := http.Get(fmt.Sprintf("http://localhost:%d/api/endpoint%d", port, i))
			if resp != nil { resp.Body.Close() }
		}

		fmt.Fprintf(w, "ServiceH processed request with 15 fanout")
	})

	log.Println("ServiceH starting on :8100")
	http.ListenAndServe(":8100", nil)
}

func generateTraffic() {
	time.Sleep(2 * time.Second)
	ticker := time.NewTicker(1 * time.Second)

	for range ticker.C {
		// Diamond pattern traffic
		go func() {
			resp, _ := http.Get("http://localhost:8001/api/serviceA")
			if resp != nil { io.ReadAll(resp.Body); resp.Body.Close() }
		}()

		// Cycle pattern traffic (less frequent to avoid loop)
		go func() {
			resp, _ := http.Get("http://localhost:8005/api/serviceE")
			if resp != nil { io.ReadAll(resp.Body); resp.Body.Close() }
		}()

		// High fanout traffic
		go func() {
			resp, _ := http.Get("http://localhost:8100/api/serviceH")
			if resp != nil { io.ReadAll(resp.Body); resp.Body.Close() }
		}()
	}
}

func main() {
	go serverA()
	go serverB()
	go serverC()
	go serverD()
	go serverE()
	go serverF()
	go serverG()
	go serverH()

	go generateTraffic()

	log.Println("All demo services started!")
	log.Println("Diamond pattern: A -> [B, C] -> D")
	log.Println("Cycle pattern: E -> F -> G -> E")
	log.Println("High fanout: H -> 15 endpoints")
	select {}
}
