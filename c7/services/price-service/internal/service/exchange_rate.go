package service

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"sync"
	"time"
)

const (
	CacheTTL = 1 * time.Hour
	RefreshInterval = 55 * time.Minute
	MockFluctuation = 0.02
)

type ExchangeRateService struct {
	rates          map[string]float64
	lastUpdate     time.Time
	mu             sync.RWMutex
	apiURL         string
	useMock        bool
	ctx            context.Context
	cancel         context.CancelFunc
	refreshTicker  *time.Ticker
}

var defaultRates = map[string]float64{
	"USD": 1.0,
	"EUR": 0.92,
	"GBP": 0.79,
	"JPY": 149.50,
	"CNY": 7.25,
	"CAD": 1.37,
	"AUD": 1.55,
	"HKD": 7.80,
	"SGD": 1.35,
	"KRW": 1330.0,
	"INR": 83.50,
}

type ExchangeRateOption func(*ExchangeRateService)

func WithMockMode(enable bool) ExchangeRateOption {
	return func(s *ExchangeRateService) {
		s.useMock = enable
	}
}

func WithAPIURL(url string) ExchangeRateOption {
	return func(s *ExchangeRateService) {
		s.apiURL = url
	}
}

func NewExchangeRateService(opts ...ExchangeRateOption) *ExchangeRateService {
	ctx, cancel := context.WithCancel(context.Background())

	s := &ExchangeRateService{
		rates:    cloneRates(defaultRates),
		apiURL:   "https://api.exchangerate-api.com/v4/latest/USD",
		useMock:  true,
		ctx:      ctx,
		cancel:   cancel,
	}

	for _, opt := range opts {
		opt(s)
	}

	s.lastUpdate = time.Now()
	s.startAutoRefresh()

	return s
}

func cloneRates(src map[string]float64) map[string]float64 {
	dst := make(map[string]float64, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func (s *ExchangeRateService) Close() {
	if s.cancel != nil {
		s.cancel()
	}
	if s.refreshTicker != nil {
		s.refreshTicker.Stop()
	}
}

func (s *ExchangeRateService) startAutoRefresh() {
	s.refreshTicker = time.NewTicker(RefreshInterval)

	go func() {
		for {
			select {
			case <-s.ctx.Done():
				return
			case <-s.refreshTicker.C:
				s.refreshRates()
			}
		}
	}()
}

func (s *ExchangeRateService) refreshRates() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.useMock {
		s.mockRefreshRates()
		return
	}

	s.realRefreshRates()
}

func (s *ExchangeRateService) mockRefreshRates() {
	now := time.Now()

	for currency := range s.rates {
		if currency == "USD" {
			continue
		}

		fluctuation := (rand.Float64()*2 - 1) * MockFluctuation
		s.rates[currency] = s.rates[currency] * (1 + fluctuation)

		if currency == "JPY" || currency == "KRW" || currency == "INR" {
			s.rates[currency] = float64(int(s.rates[currency]*100)) / 100
		} else {
			s.rates[currency] = float64(int(s.rates[currency]*10000)) / 10000
		}
	}

	s.lastUpdate = now
}

func (s *ExchangeRateService) realRefreshRates() {
	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	resp, err := client.Get(s.apiURL)
	if err != nil {
		s.mockRefreshRates()
		return
	}
	defer resp.Body.Close()

	var result struct {
		Base  string             `json:"base"`
		Rates map[string]float64 `json:"rates"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		s.mockRefreshRates()
		return
	}

	if result.Base != "USD" {
		s.mockRefreshRates()
		return
	}

	s.rates = make(map[string]float64)
	for currency, rate := range result.Rates {
		s.rates[currency] = rate
	}

	s.rates["USD"] = 1.0
	s.lastUpdate = time.Now()
}

func (s *ExchangeRateService) needsRefresh() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return time.Since(s.lastUpdate) >= CacheTTL
}

func (s *ExchangeRateService) GetRate(from, to string) (float64, error) {
	if s.needsRefresh() {
		s.refreshRates()
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	fromRate, ok := s.rates[from]
	if !ok {
		return 0, fmt.Errorf("unsupported currency: %s", from)
	}

	toRate, ok := s.rates[to]
	if !ok {
		return 0, fmt.Errorf("unsupported currency: %s", to)
	}

	return toRate / fromRate, nil
}

func (s *ExchangeRateService) Convert(amount float64, from, to string) (float64, error) {
	rate, err := s.GetRate(from, to)
	if err != nil {
		return 0, err
	}

	return amount * rate, nil
}

func (s *ExchangeRateService) GetAllRates() map[string]float64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneRates(s.rates)
}

func (s *ExchangeRateService) GetLastUpdate() time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.lastUpdate
}

func (s *ExchangeRateService) SetMockRates(rates map[string]float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rates = cloneRates(rates)
	s.lastUpdate = time.Now()
}

func (s *ExchangeRateService) ForceRefresh() {
	s.refreshRates()
}
