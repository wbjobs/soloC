.PHONY: all ebpf go build-deps test clean

BINARY_NAME=syscalltracer

UNAME_S := $(shell uname -s 2>/dev/null || echo "Unknown")
UNAME_M := $(shell uname -m 2>/dev/null || echo "Unknown")

ifeq ($(UNAME_S),Linux)
    KERNEL_VERSION := $(shell uname -r)
endif

all: go

build-deps:
	go mod download
	go mod tidy

go:
	go build -o $(BINARY_NAME) .

run-simulate:
	./$(BINARY_NAME) trace --simulate --all

run-simulate-args:
	./$(BINARY_NAME) trace --simulate --all --args

stats:
	./$(BINARY_NAME) stats

events:
	./$(BINARY_NAME) events

flamegraph:
	./$(BINARY_NAME) flamegraph

export-csv:
	./$(BINARY_NAME) export csv

export-stats-csv:
	./$(BINARY_NAME) export csv --stats

detect-env:
	@echo "OS: $(UNAME_S)"
	@echo "Architecture: $(UNAME_M)"
	@if [ "$(UNAME_S)" = "Linux" ]; then \
		echo "Kernel: $(KERNEL_VERSION)"; \
	fi
	@which clang >/dev/null 2>&1 && echo "clang: yes" || echo "clang: no"
	@which bpftool >/dev/null 2>&1 && echo "bpftool: yes" || echo "bpftool: no"
	@which go >/dev/null 2>&1 && echo "go: yes" || echo "go: no"

check-deps:
	@if [ "$(UNAME_S)" != "Linux" ]; then \
		echo "ERROR: eBPF compilation requires Linux"; \
		exit 1; \
	fi
	@which clang >/dev/null 2>&1 || (echo "ERROR: clang not found" && exit 1)
	@which bpftool >/dev/null 2>&1 || (echo "ERROR: bpftool not found" && exit 1)
	@which go >/dev/null 2>&1 || (echo "ERROR: go not found" && exit 1)

vmlinux:
	@echo "Generating vmlinux.h from BTF..."
	@if [ -f /sys/kernel/btf/vmlinux ]; then \
		bpftool btf dump file /sys/kernel/btf/vmlinux format c > ebpf/vmlinux.h; \
		echo "vmlinux.h generated successfully"; \
	else \
		echo "WARNING: /sys/kernel/btf/vmlinux not found, trying to generate from kernel headers..."; \
		bpftool btf dump file /boot/vmlinux-$(KERNEL_VERSION) format c > ebpf/vmlinux.h 2>/dev/null || \
		(echo "ERROR: Cannot generate vmlinux.h. Your kernel may not have BTF enabled."; exit 1); \
	fi

ebpf: check-deps
	@echo "==> Compiling eBPF program for kernel 5.15+..."
	@if [ ! -f ebpf/vmlinux.h ]; then \
		echo "vmlinux.h not found, generating..."; \
		$(MAKE) vmlinux; \
	fi
	@echo "Using kernel headers for kernel 5.15 compatibility"
	clang -O2 -target bpf \
		-D__TARGET_ARCH_x86 \
		-I/usr/include \
		-I/usr/include/x86_64-linux-gnu \
		-Iebpf \
		-Wall \
		-Werror \
		-c ebpf/syscall_trace.c \
		-o ebpf/syscall_trace.o
	@echo "==> Generating Go skeleton..."
	bpftool gen skeleton ebpf/syscall_trace.o > internal/ebpf/syscall_trace_bpfel.go
	@echo "eBPF program compiled successfully!"

install:
	go build -o /usr/local/bin/$(BINARY_NAME) .

test:
	go test ./...

clean:
	rm -f ebpf/syscall_trace.o
	rm -f ebpf/vmlinux.h
	rm -f internal/ebpf/syscall_trace_bpfel.go
	rm -f $(BINARY_NAME)
	rm -f flamegraph.html
	rm -f syscalls.csv
	rm -f syscalltracer.db
	rm -f /tmp/syscalltracer.db

help:
	@echo "Available targets:"
	@echo "  all              - Build the Go binary (default)"
	@echo "  build-deps       - Download and tidy Go dependencies"
	@echo "  go               - Build the Go binary"
	@echo "  ebpf             - Compile eBPF program and generate Go skeleton (Linux only)"
	@echo "  detect-env       - Detect build environment"
	@echo "  vmlinux          - Generate vmlinux.h from BTF"
	@echo "  run-simulate     - Run the tracer in simulation mode"
	@echo "  run-simulate-args - Run with argument decoding"
	@echo "  stats            - Show statistics from database"
	@echo "  events           - Show recent events with decoded args"
	@echo "  flamegraph       - Generate flame graph"
	@echo "  export-csv       - Export events to CSV"
	@echo "  export-stats-csv - Export statistics to CSV"
	@echo "  install          - Install to /usr/local/bin"
	@echo "  test             - Run tests"
	@echo "  clean            - Remove build artifacts"
	@echo ""
	@echo "Quick Start (Simulation Mode):"
	@echo "  make go && make run-simulate"
	@echo ""
	@echo "On Linux with eBPF:"
	@echo "  make ebpf go"
	@echo "  sudo ./syscalltracer trace --all"
	@echo ""
	@echo "New Features:"
	@echo "  ./syscalltracer trace --args    - Show decoded arguments in real-time"
	@echo "  ./syscalltracer events          - View recent events with decoded args"
	@echo "  ./syscalltracer export csv      - Export all events to CSV"
	@echo "  ./syscalltracer export csv --stats - Export stats to CSV"
