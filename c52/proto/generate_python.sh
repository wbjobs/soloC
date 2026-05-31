#!/bin/bash
python -m grpc_tools.protoc -I. --python_out=../client/src --grpc_python_out=../client/src edge.proto
echo "Python gRPC code generated successfully"
