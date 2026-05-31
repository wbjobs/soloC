#!/bin/bash
protoc --go_out=../server --go-grpc_out=../server edge.proto
echo "Go gRPC code generated successfully"
