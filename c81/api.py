from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from datetime import datetime, timedelta
from typing import List, Optional, Dict
import numpy as np
from sqlalchemy.orm import Session
import logging

from black_scholes import (
    price_option, OptionInputs, OptionType,
    generate_volatility_surface, MIN_SIGMA, MAX_SIGMA,
    MIN_T, MIN_S, MIN_K, clamp_inputs, black_scholes_price
)
from volatility_smile import (
    VolatilitySmileCalibrator, MarketOptionData,
    implied_volatility_newton_raphson, volatility_storage,
    VolatilitySurface
)
from database import get_db, save_pricing_record, get_historical_prices
from event_store import event_store
import metrics

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Option Pricing API", version="1.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PriceOptionRequest(BaseModel):
    S: float = Field(gt=0, description="标的资产价格")
    K: float = Field(gt=0, description="行权价格")
    T: float = Field(ge=0, description="到期时间（年）")
    r: float = Field(description="无风险利率")
    sigma: float = Field(ge=0, description="波动率")
    option_type: str = Field(description="期权类型: 'call' 或 'put'")
    contract_symbol: str = Field(min_length=1, description="合约代码")
    
    @validator('sigma')
    def validate_sigma(cls, v):
        if v < MIN_SIGMA * 0.1 or v > MAX_SIGMA * 2:
            logger.warning(f"波动率输入值 {v} 超出正常范围 [{MIN_SIGMA}, {MAX_SIGMA}]，将被裁剪")
        return max(0, v)
    
    @validator('T')
    def validate_T(cls, v):
        if v < 0:
            logger.warning(f"到期时间 {v} 为负，将被置为 {MIN_T}")
        return v

class VolatilitySurfaceRequest(BaseModel):
    S: float = Field(gt=0, description="标的资产价格")
    r: float = Field(description="无风险利率")
    min_strike: float = Field(gt=0, description="最小行权价")
    max_strike: float = Field(gt=0, description="最大行权价")
    num_strikes: int = Field(ge=2, le=100, default=20, description="行权价数量")
    min_maturity: float = Field(ge=MIN_T, default=0.01, description="最小到期时间")
    max_maturity: float = Field(gt=0, default=2.0, description="最大到期时间")
    num_maturities: int = Field(ge=2, le=50, default=10, description="到期时间数量")
    base_volatility: float = Field(ge=MIN_SIGMA, le=MAX_SIGMA, default=0.2, description="基础波动率")

class ImpliedVolatilityRequest(BaseModel):
    S: float = Field(gt=0, description="标的资产价格")
    K: float = Field(gt=0, description="行权价格")
    T: float = Field(gt=0, description="到期时间")
    r: float = Field(description="无风险利率")
    market_price: float = Field(gt=0, description="市场期权价格")
    option_type: str = Field(description="期权类型: call/put")
    initial_guess: float = Field(ge=MIN_SIGMA, le=MAX_SIGMA, default=0.2, description="初始波动率猜测")

class MarketOptionDataPoint(BaseModel):
    strike: float = Field(gt=0, description="行权价格")
    maturity: float = Field(gt=0, description="到期时间")
    market_price: float = Field(gt=0, description="市场期权价格")
    option_type: str = Field(description="期权类型: call/put")

class VolatilityCalibrationRequest(BaseModel):
    underlying_symbol: str = Field(description="标的资产代码")
    underlying_price: float = Field(gt=0, description="标的资产当前价格")
    risk_free_rate: float = Field(default=0.05, description="无风险利率")
    market_options: List[MarketOptionDataPoint] = Field(min_items=3, description="市场期权数据列表")
    surface_id: Optional[str] = Field(None, description="自定义曲面ID")
    interpolation_method: str = Field(default="cubic", description="插值方法: linear/cubic")

class PriceWithSmileRequest(BaseModel):
    S: float = Field(gt=0, description="标的资产价格")
    K: float = Field(gt=0, description="行权价格")
    T: float = Field(gt=0, description="到期时间")
    r: float = Field(description="无风险利率")
    option_type: str = Field(description="期权类型: call/put")
    contract_symbol: str = Field(description="合约代码")
    surface_id: Optional[str] = Field(None, description="使用指定的波动率曲面ID，不填则使用最新曲面")
    underlying_symbol: Optional[str] = Field(None, description="标的资产代码，用于获取最新曲面")

def validate_and_clamp_inputs(request: PriceOptionRequest) -> Dict:
    S_c, K_c, T_c, r_c, sigma_c = clamp_inputs(
        request.S, request.K, request.T, request.r, request.sigma
    )
    
    warnings = []
    if request.S != S_c:
        warnings.append(f"S被从 {request.S} 裁剪到 {S_c}")
    if request.K != K_c:
        warnings.append(f"K被从 {request.K} 裁剪到 {K_c}")
    if request.T != T_c:
        warnings.append(f"T被从 {request.T} 裁剪到 {T_c}")
    if request.r != r_c:
        warnings.append(f"r被从 {request.r} 裁剪到 {r_c}")
    if request.sigma != sigma_c:
        warnings.append(f"sigma被从 {request.sigma} 裁剪到 {sigma_c}")
    
    return {
        'S': S_c, 'K': K_c, 'T': T_c, 'r': r_c, 'sigma': sigma_c,
        'warnings': warnings
    }

@app.get("/")
async def root():
    return {
        "message": "Option Pricing API", 
        "version": "1.0.1",
        "input_bounds": {
            "sigma": [MIN_SIGMA, MAX_SIGMA],
            "T_min": MIN_T,
            "S_min": MIN_S,
            "K_min": MIN_K
        }
    }

@app.post("/api/price")
async def calculate_option_price(request: PriceOptionRequest, db: Session = Depends(get_db)):
    try:
        option_type = OptionType(request.option_type.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid option_type. Must be 'call' or 'put'")
    
    validation = validate_and_clamp_inputs(request)
    warnings = validation['warnings']
    
    if warnings:
        logger.info(f"输入裁剪警告: {warnings}")
    
    inputs = OptionInputs(
        S=validation['S'],
        K=validation['K'],
        T=validation['T'],
        r=validation['r'],
        sigma=validation['sigma'],
        option_type=option_type,
        contract_symbol=request.contract_symbol
    )
    
    with metrics.pricing_duration_seconds.labels(contract_symbol=request.contract_symbol).time():
        result = price_option(inputs)
    
    save_pricing_record(db, result)
    metrics.increment_database_writes("option_pricing_records")
    
    event_store.publish_option_pricing(result)
    metrics.increment_events_published("option_pricing")
    
    metrics.update_option_metrics(result)
    
    response = {
        "contract_symbol": request.contract_symbol,
        "option_type": result.inputs.option_type.value,
        "price": round(result.price, 4),
        "greeks": {
            "delta": round(result.greeks.delta, 4),
            "gamma": round(result.greeks.gamma, 6),
            "theta": round(result.greeks.theta, 6),
            "vega": round(result.greeks.vega, 4),
            "rho": round(result.greeks.rho, 4)
        },
        "inputs": {
            "requested": {
                "S": request.S,
                "K": request.K,
                "T": request.T,
                "r": request.r,
                "sigma": request.sigma
            },
            "used": {
                "S": validation['S'],
                "K": validation['K'],
                "T": validation['T'],
                "r": validation['r'],
                "sigma": validation['sigma']
            }
        },
        "timestamp": result.timestamp
    }
    
    if warnings:
        response["warnings"] = warnings
    
    return response

@app.get("/api/history/{contract_symbol}")
async def get_pricing_history(
    contract_symbol: str,
    hours: int = 24,
    db: Session = Depends(get_db)
):
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(hours=hours)
    
    records = get_historical_prices(db, contract_symbol, start_time, end_time)
    
    return {
        "contract_symbol": contract_symbol,
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "count": len(records),
        "data": [
            {
                "timestamp": r.timestamp.isoformat(),
                "option_type": r.option_type,
                "price": round(r.price, 4),
                "S": r.S,
                "K": r.K,
                "T": r.T,
                "greeks": {
                    "delta": round(r.delta, 4),
                    "gamma": round(r.gamma, 6),
                    "theta": round(r.theta, 6),
                    "vega": round(r.vega, 4),
                    "rho": round(r.rho, 4)
                }
            }
            for r in records
        ]
    }

@app.post("/api/volatility-surface")
async def create_volatility_surface(request: VolatilitySurfaceRequest):
    strikes = np.linspace(request.min_strike, request.max_strike, request.num_strikes)
    maturities = np.linspace(request.min_maturity, request.max_maturity, request.num_maturities)
    
    surface_data = generate_volatility_surface(
        S=request.S,
        r=request.r,
        strikes=strikes,
        maturities=maturities,
        base_volatility=request.base_volatility
    )
    
    return surface_data

@app.get("/api/events")
async def get_recent_events(last_id: str = "0", count: int = 100):
    events = event_store.read_events(last_id=last_id, count=count)
    return {
        "count": len(events),
        "events": events
    }

@app.get("/api/stocks/latest")
async def get_latest_stock_prices():
    symbols = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA"]
    prices = {}
    for symbol in symbols:
        price_data = event_store.get_latest_price(symbol)
        if price_data:
            prices[symbol] = price_data["price"]
    return {"prices": prices, "timestamp": datetime.utcnow().isoformat()}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

@app.post("/api/implied-volatility")
async def calculate_iv(request: ImpliedVolatilityRequest):
    try:
        option_type = OptionType(request.option_type.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的期权类型，必须是 call 或 put")
    
    iv, error = implied_volatility_newton_raphson(
        market_price=request.market_price,
        S=request.S,
        K=request.K,
        T=request.T,
        r=request.r,
        option_type=option_type,
        initial_guess=request.initial_guess
    )
    
    if iv is None:
        raise HTTPException(status_code=400, detail="隐含波动率计算失败")
    
    return {
        "implied_volatility": round(iv, 6),
        "pricing_error": round(error, 8),
        "inputs": {
            "S": request.S,
            "K": request.K,
            "T": request.T,
            "r": request.r,
            "market_price": request.market_price,
            "option_type": request.option_type
        }
    }

@app.post("/api/volatility-surface/calibrate")
async def calibrate_volatility_surface(request: VolatilityCalibrationRequest):
    calibrator = VolatilitySmileCalibrator(
        underlying_symbol=request.underlying_symbol,
        risk_free_rate=request.risk_free_rate
    )
    
    for opt in request.market_options:
        try:
            option_type = OptionType(opt.option_type.lower())
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"无效的期权类型: {opt.option_type}，必须是 call 或 put"
            )
        
        market_data = MarketOptionData(
            strike=opt.strike,
            maturity=opt.maturity,
            market_price=opt.market_price,
            option_type=option_type,
            underlying_price=request.underlying_price,
            risk_free_rate=request.risk_free_rate
        )
        calibrator.add_market_data(market_data)
    
    try:
        surface = calibrator.calibrate_volatility_surface(
            underlying_price=request.underlying_price,
            interpolation_method=request.interpolation_method,
            surface_id=request.surface_id
        )
        surface_id = volatility_storage.save_surface(surface)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"波动率曲面校准失败: {e}")
        raise HTTPException(status_code=500, detail=f"校准失败: {str(e)}")
    
    return {
        "surface_id": surface_id,
        "underlying_symbol": surface.underlying_symbol,
        "calibration_date": surface.calibration_date.isoformat(),
        "strikes": [round(s, 2) for s in surface.strikes],
        "maturities": [round(m, 4) for m in surface.maturities],
        "volatility_matrix": [[round(v, 6) for v in row] for row in surface.volatilities],
        "calibration_points": [
            {
                "strike": round(cp.strike, 2),
                "maturity": round(cp.maturity, 4),
                "market_price": round(cp.market_price, 4),
                "implied_vol": round(cp.implied_vol, 6),
                "error": round(cp.pricing_error, 8)
            }
            for cp in surface.calibration_points
        ],
        "num_points": len(surface.calibration_points)
    }

@app.get("/api/volatility-surface")
async def list_volatility_surfaces(underlying_symbol: Optional[str] = None):
    surfaces = volatility_storage.list_surfaces(underlying_symbol)
    return {
        "count": len(surfaces),
        "surfaces": surfaces
    }

@app.get("/api/volatility-surface/{surface_id}")
async def get_volatility_surface(surface_id: str):
    surface = volatility_storage.get_surface(surface_id)
    if surface is None:
        raise HTTPException(status_code=404, detail=f"波动率曲面 {surface_id} 不存在")
    
    return surface.to_dict()

@app.delete("/api/volatility-surface/{surface_id}")
async def delete_volatility_surface(surface_id: str):
    if volatility_storage.delete_surface(surface_id):
        return {"status": "success", "message": f"波动率曲面 {surface_id} 已删除"}
    raise HTTPException(status_code=404, detail=f"波动率曲面 {surface_id} 不存在")

@app.get("/api/volatility-surface/latest/{underlying_symbol}")
async def get_latest_volatility_surface(underlying_symbol: str):
    surface = volatility_storage.get_latest_surface(underlying_symbol)
    if surface is None:
        raise HTTPException(status_code=404, detail=f"标的 {underlying_symbol} 没有可用的波动率曲面")
    
    return surface.to_dict()

@app.get("/api/volatility-surface/{surface_id}/interpolate")
async def interpolate_volatility(
    surface_id: str,
    K: float,
    T: float
):
    surface = volatility_storage.get_surface(surface_id)
    if surface is None:
        raise HTTPException(status_code=404, detail=f"波动率曲面 {surface_id} 不存在")
    
    calibrator = VolatilitySmileCalibrator(surface.underlying_symbol, surface.risk_free_rate)
    interpolated_vol = calibrator.get_volatility_for_pricing(K, T, surface)
    
    return {
        "surface_id": surface_id,
        "requested_strike": K,
        "requested_maturity": T,
        "interpolated_volatility": round(interpolated_vol, 6),
        "surface_strike_range": [min(surface.strikes), max(surface.strikes)],
        "surface_maturity_range": [min(surface.maturities), max(surface.maturities)]
    }

@app.post("/api/price-with-smile")
async def price_with_volatility_smile(request: PriceWithSmileRequest, db: Session = Depends(get_db)):
    try:
        option_type = OptionType(request.option_type.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的期权类型，必须是 call 或 put")
    
    if request.surface_id:
        surface = volatility_storage.get_surface(request.surface_id)
        if surface is None:
            raise HTTPException(status_code=404, detail=f"波动率曲面 {request.surface_id} 不存在")
    elif request.underlying_symbol:
        surface = volatility_storage.get_latest_surface(request.underlying_symbol)
        if surface is None:
            raise HTTPException(status_code=404, detail=f"标的 {request.underlying_symbol} 没有可用的波动率曲面")
    else:
        raise HTTPException(status_code=400, detail="必须提供 surface_id 或 underlying_symbol")
    
    calibrator = VolatilitySmileCalibrator(surface.underlying_symbol, surface.risk_free_rate)
    sigma = calibrator.get_volatility_for_pricing(request.K, request.T, surface)
    
    inputs = OptionInputs(
        S=request.S,
        K=request.K,
        T=request.T,
        r=request.r,
        sigma=sigma,
        option_type=option_type,
        contract_symbol=request.contract_symbol
    )
    
    result = price_option(inputs)
    
    save_pricing_record(db, result)
    
    return {
        "contract_symbol": request.contract_symbol,
        "option_type": result.inputs.option_type.value,
        "price": round(result.price, 4),
        "greeks": {
            "delta": round(result.greeks.delta, 4),
            "gamma": round(result.greeks.gamma, 6),
            "theta": round(result.greeks.theta, 6),
            "vega": round(result.greeks.vega, 4),
            "rho": round(result.greeks.rho, 4)
        },
        "inputs": {
            "S": request.S,
            "K": request.K,
            "T": request.T,
            "r": request.r,
            "used_sigma": round(sigma, 6),
            "surface_id": surface.surface_id
        },
        "timestamp": result.timestamp
    }
