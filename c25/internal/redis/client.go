package redis

import (
	"context"
	"time"

	"github.com/go-redis/redis/v8"
)

var ctx = context.Background()

type Client struct {
	rdb *redis.Client
}

func NewClient(addr, password string, db int) *Client {
	rdb := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
		PoolSize: 10,
	})

	return &Client{rdb: rdb}
}

func (c *Client) Ping() error {
	_, err := c.rdb.Ping(ctx).Result()
	return err
}

func (c *Client) Get(key string) (string, error) {
	return c.rdb.Get(ctx, key).Result()
}

func (c *Client) Set(key string, value interface{}, expiration time.Duration) error {
	return c.rdb.Set(ctx, key, value, expiration).Err()
}

func (c *Client) Del(key string) error {
	return c.rdb.Del(ctx, key).Err()
}

func (c *Client) Exists(key string) bool {
	result, err := c.rdb.Exists(ctx, key).Result()
	return err == nil && result > 0
}

func (c *Client) HGetAll(key string) (map[string]string, error) {
	return c.rdb.HGetAll(ctx, key).Result()
}

func (c *Client) HSet(key string, fields map[string]interface{}) error {
	return c.rdb.HSet(ctx, key, fields).Err()
}

func (c *Client) SAdd(key string, members ...interface{}) error {
	return c.rdb.SAdd(ctx, key, members...).Err()
}

func (c *Client) SRem(key string, members ...interface{}) error {
	return c.rdb.SRem(ctx, key, members...).Err()
}

func (c *Client) SMembers(key string) ([]string, error) {
	return c.rdb.SMembers(ctx, key).Result()
}

func (c *Client) LPush(key string, values ...interface{}) error {
	return c.rdb.LPush(ctx, key, values...).Err()
}

func (c *Client) RPop(key string) (string, error) {
	return c.rdb.RPop(ctx, key).Result()
}

func (c *Client) LRange(key string, start, stop int64) ([]string, error) {
	return c.rdb.LRange(ctx, key, start, stop).Result()
}

func (c *Client) ZAdd(key string, score float64, member string) error {
	return c.rdb.ZAdd(ctx, key, &redis.Z{Score: score, Member: member}).Err()
}

func (c *Client) ZRangeByScore(key string, min, max string) ([]string, error) {
	return c.rdb.ZRangeByScore(ctx, key, &redis.ZRangeBy{Min: min, Max: max}).Result()
}

func (c *Client) ZRem(key string, members ...interface{}) error {
	return c.rdb.ZRem(ctx, key, members...).Err()
}

func (c *Client) Incr(key string) (int64, error) {
	return c.rdb.Incr(ctx, key).Result()
}

func (c *Client) Expire(key string, expiration time.Duration) error {
	return c.rdb.Expire(ctx, key, expiration).Err()
}

func (c *Client) Publish(channel string, message interface{}) error {
	return c.rdb.Publish(ctx, channel, message).Err()
}

func (c *Client) Subscribe(channels ...string) *redis.PubSub {
	return c.rdb.Subscribe(ctx, channels...)
}

func (c *Client) Close() error {
	return c.rdb.Close()
}

func (c *Client) SetNX(key string, value interface{}, expiration time.Duration) (bool, error) {
	return c.rdb.SetNX(ctx, key, value, expiration).Result()
}

func (c *Client) Eval(script string, keys []string, args ...interface{}) (interface{}, error) {
	return c.rdb.Eval(ctx, script, keys, args...).Result()
}

func (c *Client) SetWithKeepTTL(key string, value interface{}) error {
	return c.rdb.SetXX(ctx, key, value, -1).Err()
}

func (c *Client) Watch(fn func(*redis.Tx) error, keys ...string) error {
	return c.rdb.Watch(ctx, fn, keys...)
}
