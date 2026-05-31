from fastapi import FastAPI, HTTPException, Query
from typing import List

from app.models.span import Span
from app.storage.influxdb import influx_storage
from app.storage.redis import redis_storage
from app.anomaly.history import anomaly_history_store

app = FastAPI(title="分布式服务拓扑自动发现与存储服务")


@app.post("/spans", status_code=201)
def report_spans(spans: List[Span]):
    try:
        for span in spans:
            influx_storage.write_span(span.model_dump())
        return {"status": "success", "count": len(spans)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store spans: {str(e)}")


@app.get("/topology")
def get_topology(time_range: str = Query("15m", description="时间范围，如 15m, 1h, 24h")):
    try:
        topology = redis_storage.get_topology()
        return topology
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get topology: {str(e)}")


@app.get("/anomaly/history")
def get_anomaly_history(
    limit: int = Query(100, ge=1, le=1000, description="返回的异常事件数量")
):
    try:
        history = anomaly_history_store.get_history(limit=limit)
        return {
            "count": len(history),
            "anomalies": history
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get anomaly history: {str(e)}")


@app.get("/health")
def health_check():
    return {"status": "healthy"}
