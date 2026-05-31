#!/bin/bash

PROTOC_GEN_GO=$(which protoc-gen-go)
PROTOC_GEN_GO_GRPC=$(which protoc-gen-go-grpc)

if [ -z "$PROTOC_GEN_GO" ] || [ -z "$PROTOC_GEN_GO_GRPC" ]; then
    echo "Installing protobuf tools..."
    go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
fi

PROTO_DIR="./api/proto"
OUT_DIR="./api/gen"

mkdir -p "$OUT_DIR"

echo "Generating gRPC code..."

protoc \
    --go_out="$OUT_DIR" \
    --go_opt=paths=source_relative \
    --go-grpc_out="$OUT_DIR" \
    --go-grpc_opt=paths=source_relative \
    -I "$PROTO_DIR" \
    "$PROTO_DIR/monitor.proto"

echo "Done!"
