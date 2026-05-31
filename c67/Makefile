.PHONY: all build ebpf frontend run clean

all: build

ebpf:
	cd pkg/ebpf && go generate

frontend:
	cd frontend && npm install && npm run build

build: ebpf frontend
	go build -o network-monitor agent/main.go

run:
	sudo ./network-monitor

clean:
	rm -f network-monitor
	rm -rf frontend/build
	rm -f pkg/ebpf/tcphook_*.go pkg/ebpf/tcphook_*.o
