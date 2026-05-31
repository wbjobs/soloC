module blockchain-monitor

go 1.21

require (
	github.com/influxdata/influxdb-client-go/v2 v2.12.3
	google.golang.org/grpc v1.59.0
	google.golang.org/protobuf v1.31.0
	github.com/ethereum/go-ethereum v1.13.5
	github.com/btcsuite/btcd/btcjson v1.0.1
	github.com/btcsuite/btcd/rpcclient v0.8.0
	golang.org/x/net v0.17.0
	github.com/sirupsen/logrus v1.9.3
	github.com/joho/godotenv v1.5.1
	gopkg.in/gomail.v2 v2.0.0-20160411212932-81ebce5c23df
	github.com/slack-go/slack v0.12.5
	github.com/gorilla/mux v1.8.1
)
