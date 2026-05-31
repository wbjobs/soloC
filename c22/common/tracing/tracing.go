package tracing

import (
	"context"
	"fmt"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.17.0"
	"go.opentelemetry.io/otel/trace"

	"distributed-scheduler/common/config"
	"distributed-scheduler/common/logger"
)

var (
	tracerProvider *sdktrace.TracerProvider
	tracer         trace.Tracer
)

func Init(cfg *config.TracingConfig) (*sdktrace.TracerProvider, error) {
	if cfg == nil || !cfg.Enabled {
		logger.Info("tracing is disabled")
		return nil, nil
	}

	ctx := context.Background()

	var opts []otlptracegrpc.Option
	opts = append(opts, otlptracegrpc.WithEndpoint(cfg.Endpoint))
	if cfg.Insecure {
		opts = append(opts, otlptracegrpc.WithInsecure())
	}

	client := otlptracegrpc.NewClient(opts...)
	exporter, err := otlptrace.New(ctx, client)
	if err != nil {
		return nil, fmt.Errorf("failed to create OTLP trace exporter: %w", err)
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(cfg.ServiceName),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	tracerProvider = sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
	)

	otel.SetTracerProvider(tracerProvider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	tracer = tracerProvider.Tracer(cfg.ServiceName)
	logger.Info("tracing initialized", "endpoint", cfg.Endpoint, "service", cfg.ServiceName)

	return tracerProvider, nil
}

func Shutdown(ctx context.Context) error {
	if tracerProvider != nil {
		return tracerProvider.Shutdown(ctx)
	}
	return nil
}

func Tracer() trace.Tracer {
	if tracer == nil {
		return otel.Tracer("distributed-scheduler")
	}
	return tracer
}

func StartSpan(ctx context.Context, name string, opts ...trace.SpanStartOption) (context.Context, trace.Span) {
	return Tracer().Start(ctx, name, opts...)
}

func SpanFromContext(ctx context.Context) trace.Span {
	return trace.SpanFromContext(ctx)
}
