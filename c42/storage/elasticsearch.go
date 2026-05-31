package storage

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/elastic/go-elasticsearch/v8"
	"github.com/elastic/go-elasticsearch/v8/esapi"
)

type ESClient struct {
	client *elasticsearch.Client
	index  string
	ctx    context.Context
}

func NewESClient(addresses []string, username, password, index string) *ESClient {
	cfg := elasticsearch.Config{
		Addresses: addresses,
		Username:  username,
		Password:  password,
	}

	client, err := elasticsearch.NewClient(cfg)
	if err != nil {
		log.Printf("Elasticsearch client creation error: %v", err)
	}

	if client != nil {
		res, err := client.Info()
		if err != nil {
			log.Printf("Elasticsearch info warning: %v", err)
		} else {
			res.Body.Close()
		}
	}

	return &ESClient{
		client: client,
		index:  index,
		ctx:    context.Background(),
	}
}

func (esc *ESClient) Process(data []byte) error {
	return esc.Index(data)
}

func (esc *ESClient) Index(data []byte) error {
	if esc.client == nil {
		log.Printf("Elasticsearch client not initialized")
		return nil
	}

	req := esapi.IndexRequest{
		Index:      esc.index,
		Body:       bytes.NewReader(data),
		Refresh:    "true",
	}

	res, err := req.Do(esc.ctx, esc.client)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.IsError() {
		log.Printf("Elasticsearch index error: %s", res.Status())
	}

	return nil
}

func (esc *ESClient) BulkIndex(dataList [][]byte) error {
	if esc.client == nil {
		log.Printf("Elasticsearch client not initialized")
		return nil
	}

	var buf bytes.Buffer

	for _, data := range dataList {
		meta := []byte(`{"index":{}}` + "\n")
		buf.Write(meta)
		buf.Write(data)
		buf.WriteByte('\n')
	}

	req := esapi.BulkRequest{
		Index:   esc.index,
		Body:    bytes.NewReader(buf.Bytes()),
		Refresh: "true",
	}

	res, err := req.Do(esc.ctx, esc.client)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.IsError() {
		log.Printf("Elasticsearch bulk index error: %s", res.Status())
	}

	return nil
}

func (esc *ESClient) Search(query string) (*bytes.Buffer, error) {
	if esc.client == nil {
		return nil, nil
	}

	var buf bytes.Buffer

	req := esapi.SearchRequest{
		Index: []string{esc.index},
		Body:  strings.NewReader(query),
	}

	res, err := req.Do(esc.ctx, esc.client)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.IsError() {
		return nil, err
	}

	_, err = buf.ReadFrom(res.Body)
	if err != nil {
		return nil, err
	}

	return &buf, nil
}

func (esc *ESClient) CreateIndexIfNotExists(mapping string) error {
	if esc.client == nil {
		return nil
	}

	req := esapi.IndicesExistsRequest{
		Index: []string{esc.index},
	}

	res, err := req.Do(esc.ctx, esc.client)
	if err != nil {
		return err
	}
	res.Body.Close()

	if res.StatusCode == 200 {
		return nil
	}

	createReq := esapi.IndicesCreateRequest{
		Index: esc.index,
		Body:  strings.NewReader(mapping),
	}

	createRes, err := createReq.Do(esc.ctx, esc.client)
	if err != nil {
		return err
	}
	defer createRes.Body.Close()

	if createRes.IsError() {
		log.Printf("Create index error: %s", createRes.Status())
	}

	return nil
}
