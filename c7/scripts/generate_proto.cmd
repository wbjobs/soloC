@echo off
echo Generating Go code from proto files...

if not exist "proto\common" (
    mkdir proto\common
)
if not exist "proto\price" (
    mkdir proto\price
)
if not exist "proto\inventory" (
    mkdir proto\inventory
)

protoc ^
    --proto_path=. ^
    --go_out=. ^
    --go_opt=paths=source_relative ^
    --go-grpc_out=. ^
    --go-grpc_opt=paths=source_relative ^
    proto/common/common.proto ^
    proto/price/price.proto ^
    proto/inventory/inventory.proto

echo Proto generation completed!
pause
