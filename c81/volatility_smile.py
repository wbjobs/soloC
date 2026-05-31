import math
import numpy as np
from scipy import optimize
from scipy.interpolate import interp1d, CubicSpline
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Callable
from datetime import datetime
import json
import logging

from black_scholes import (
    black_scholes_price, OptionType,
    MIN_SIGMA, MAX_SIGMA, clamp_inputs
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class MarketOptionData:
    strike: float
    maturity: float
    market_price: float
    option_type: OptionType
    underlying_price: float
    risk_free_rate: float

@dataclass
class CalibrationPoint:
    strike: float
    maturity: float
    market_price: float
    implied_vol: float
    pricing_error: float

@dataclass
class VolatilitySurface:
    surface_id: str
    underlying_symbol: str
    calibration_date: datetime
    risk_free_rate: float
    underlying_price: float
    strikes: List[float] = field(default_factory=list)
    maturities: List[float] = field(default_factory=list)
    volatilities: List[List[float]] = field(default_factory=list)
    calibration_points: List[CalibrationPoint] = field(default_factory=list)
    interpolation_method: str = "cubic"
    _interpolator: Optional[Callable] = field(default=None, repr=False)
    
    def to_dict(self) -> Dict:
        return {
            "surface_id": self.surface_id,
            "underlying_symbol": self.underlying_symbol,
            "calibration_date": self.calibration_date.isoformat(),
            "risk_free_rate": self.risk_free_rate,
            "underlying_price": self.underlying_price,
            "strikes": self.strikes,
            "maturities": self.maturities,
            "volatilities": self.volatilities,
            "interpolation_method": self.interpolation_method,
            "calibration_points": [
                {
                    "strike": cp.strike,
                    "maturity": cp.maturity,
                    "market_price": cp.market_price,
                    "implied_vol": cp.implied_vol,
                    "pricing_error": cp.pricing_error
                }
                for cp in self.calibration_points
            ]
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'VolatilitySurface':
        surface = cls(
            surface_id=data["surface_id"],
            underlying_symbol=data["underlying_symbol"],
            calibration_date=datetime.fromisoformat(data["calibration_date"]),
            risk_free_rate=data["risk_free_rate"],
            underlying_price=data["underlying_price"],
            strikes=data["strikes"],
            maturities=data["maturities"],
            volatilities=data["volatilities"],
            interpolation_method=data.get("interpolation_method", "cubic")
        )
        surface.calibration_points = [
            CalibrationPoint(**cp) for cp in data.get("calibration_points", [])
        ]
        return surface

def calculate_implied_volatility(
    market_price: float,
    S: float,
    K: float,
    T: float,
    r: float,
    option_type: OptionType,
    initial_guess: float = 0.2,
    max_iterations: int = 100,
    tolerance: float = 1e-8
) -> Tuple[Optional[float], float]:
    S_c, K_c, T_c, r_c, _ = clamp_inputs(S, K, T, r, initial_guess)
    
    if T_c <= 0:
        return None, 0.0
    
    if market_price <= 0:
        logger.warning(f"市场价格非正: {market_price}")
        return None, 0.0
    
    def objective_function(sigma):
        if sigma <= 0:
            return float('inf')
        model_price = black_scholes_price(S_c, K_c, T_c, r_c, sigma, option_type)
        return (model_price - market_price) ** 2
    
    bounds = [(MIN_SIGMA, MAX_SIGMA)]
    
    try:
        result = optimize.minimize(
            objective_function,
            x0=[max(MIN_SIGMA, min(initial_guess, MAX_SIGMA))],
            bounds=bounds,
            method='L-BFGS-B',
            options={'maxiter': max_iterations, 'ftol': tolerance}
        )
        
        if result.success:
            iv = max(MIN_SIGMA, min(result.x[0], MAX_SIGMA))
            final_price = black_scholes_price(S_c, K_c, T_c, r_c, iv, option_type)
            error = abs(final_price - market_price) / market_price if market_price > 0 else 0
            return iv, error
        else:
            logger.warning(f"IV计算未收敛: {result.message}")
            return None, float('inf')
            
    except Exception as e:
        logger.error(f"IV计算异常: {e}")
        return None, float('inf')

def calculate_vega_for_iv(
    S: float,
    K: float,
    T: float,
    r: float,
    sigma: float
) -> float:
    S, K, T, r, sigma = clamp_inputs(S, K, T, r, sigma)
    if T <= 0:
        return 0.0
    
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    d1 = max(-10.0, min(10.0, d1))
    pdf_d1 = math.exp(-0.5 * d1 ** 2) / math.sqrt(2 * math.pi)
    return S * pdf_d1 * math.sqrt(T)

def implied_volatility_newton_raphson(
    market_price: float,
    S: float,
    K: float,
    T: float,
    r: float,
    option_type: OptionType,
    initial_guess: float = 0.2,
    max_iterations: int = 50,
    tolerance: float = 1e-7
) -> Tuple[Optional[float], float]:
    S_c, K_c, T_c, r_c, _ = clamp_inputs(S, K, T, r, initial_guess)
    
    if T_c <= 0 or market_price <= 0:
        return None, 0.0
    
    sigma = max(MIN_SIGMA, min(initial_guess, MAX_SIGMA))
    
    for i in range(max_iterations):
        model_price = black_scholes_price(S_c, K_c, T_c, r_c, sigma, option_type)
        price_diff = model_price - market_price
        
        if abs(price_diff) < tolerance:
            error = abs(price_diff) / market_price
            return sigma, error
        
        vega = calculate_vega_for_iv(S_c, K_c, T_c, r_c, sigma)
        
        if abs(vega) < 1e-10:
            break
        
        sigma = sigma - price_diff / vega
        sigma = max(MIN_SIGMA, min(sigma, MAX_SIGMA))
    
    final_price = black_scholes_price(S_c, K_c, T_c, r_c, sigma, option_type)
    error = abs(final_price - market_price) / market_price if market_price > 0 else float('inf')
    return sigma, error

class VolatilitySmileCalibrator:
    def __init__(self, underlying_symbol: str, risk_free_rate: float = 0.05):
        self.underlying_symbol = underlying_symbol
        self.risk_free_rate = risk_free_rate
        self.market_data: List[MarketOptionData] = []
        self.last_surface: Optional[VolatilitySurface] = None
    
    def add_market_data(self, data: MarketOptionData):
        self.market_data.append(data)
    
    def add_market_data_batch(self, data_list: List[MarketOptionData]):
        self.market_data.extend(data_list)
    
    def clear_market_data(self):
        self.market_data = []
    
    def calibrate_volatility_surface(
        self,
        underlying_price: float,
        interpolation_method: str = "cubic",
        surface_id: Optional[str] = None
    ) -> VolatilitySurface:
        if not self.market_data:
            raise ValueError("没有市场数据可供校准")
        
        calibration_points: List[CalibrationPoint] = []
        
        for data in self.market_data:
            iv, error = implied_volatility_newton_raphson(
                market_price=data.market_price,
                S=data.underlying_price,
                K=data.strike,
                T=data.maturity,
                r=self.risk_free_rate,
                option_type=data.option_type
            )
            
            if iv is not None and error < 0.1:
                calibration_points.append(CalibrationPoint(
                    strike=data.strike,
                    maturity=data.maturity,
                    market_price=data.market_price,
                    implied_vol=iv,
                    pricing_error=error
                ))
        
        if not calibration_points:
            raise ValueError("IV计算全部失败，无法校准波动率曲面")
        
        unique_strikes = sorted(list(set(cp.strike for cp in calibration_points)))
        unique_maturities = sorted(list(set(cp.maturity for cp in calibration_points)))
        
        vol_matrix = []
        for T in unique_maturities:
            vol_row = []
            points_at_maturity = [cp for cp in calibration_points if abs(cp.maturity - T) < 1e-10]
            
            if len(points_at_maturity) >= 2:
                strikes_at_maturity = [cp.strike for cp in points_at_maturity]
                vols_at_maturity = [cp.implied_vol for cp in points_at_maturity]
                
                interpolator = interp1d(
                    strikes_at_maturity,
                    vols_at_maturity,
                    kind='linear' if len(points_at_maturity) < 4 else 'cubic',
                    fill_value='extrapolate',
                    bounds_error=False
                )
                
                for K in unique_strikes:
                    vol = float(interpolator(K))
                    vol = max(MIN_SIGMA, min(vol, MAX_SIGMA))
                    vol_row.append(vol)
            else:
                default_vol = points_at_maturity[0].implied_vol if points_at_maturity else 0.2
                vol_row = [default_vol] * len(unique_strikes)
            
            vol_matrix.append(vol_row)
        
        surface_id = surface_id or f"{self.underlying_symbol}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        surface = VolatilitySurface(
            surface_id=surface_id,
            underlying_symbol=self.underlying_symbol,
            calibration_date=datetime.now(),
            risk_free_rate=self.risk_free_rate,
            underlying_price=underlying_price,
            strikes=unique_strikes,
            maturities=unique_maturities,
            volatilities=vol_matrix,
            calibration_points=calibration_points,
            interpolation_method=interpolation_method
        )
        
        self.last_surface = surface
        return surface
    
    def get_volatility_for_pricing(
        self,
        K: float,
        T: float,
        surface: Optional[VolatilitySurface] = None
    ) -> float:
        vol_surface = surface or self.last_surface
        
        if vol_surface is None:
            logger.warning("没有可用的波动率曲面，使用默认值 0.2")
            return 0.2
        
        if not vol_surface.strikes or not vol_surface.maturities:
            return 0.2
        
        strikes = np.array(vol_surface.strikes)
        maturities = np.array(vol_surface.maturities)
        vols = np.array(vol_surface.volatilities)
        
        K_clamped = max(strikes.min(), min(K, strikes.max()))
        T_clamped = max(maturities.min(), min(T, maturities.max()))
        
        if len(maturities) == 1:
            t_idx = 0
        else:
            t_idx = np.searchsorted(maturities, T_clamped, side='right') - 1
            t_idx = max(0, min(t_idx, len(maturities) - 2))
        
        t_weight = (T_clamped - maturities[t_idx]) / (maturities[t_idx + 1] - maturities[t_idx]) if len(maturities) > 1 else 0
        t_weight = max(0, min(t_weight, 1))
        
        def interpolate_strike(vol_row):
            if len(strikes) == 1:
                return vol_row[0]
            
            k_idx = np.searchsorted(strikes, K_clamped, side='right') - 1
            k_idx = max(0, min(k_idx, len(strikes) - 2))
            
            k_weight = (K_clamped - strikes[k_idx]) / (strikes[k_idx + 1] - strikes[k_idx])
            k_weight = max(0, min(k_weight, 1))
            
            return vol_row[k_idx] * (1 - k_weight) + vol_row[k_idx + 1] * k_weight
        
        vol_t0 = interpolate_strike(vols[t_idx])
        
        if len(maturities) > 1 and t_idx + 1 < len(vols):
            vol_t1 = interpolate_strike(vols[t_idx + 1])
            vol = vol_t0 * (1 - t_weight) + vol_t1 * t_weight
        else:
            vol = vol_t0
        
        return max(MIN_SIGMA, min(vol, MAX_SIGMA))

class VolatilitySurfaceStorage:
    def __init__(self):
        self._storage: Dict[str, VolatilitySurface] = {}
        self._symbol_to_surfaces: Dict[str, List[str]] = {}
    
    def save_surface(self, surface: VolatilitySurface) -> str:
        self._storage[surface.surface_id] = surface
        
        if surface.underlying_symbol not in self._symbol_to_surfaces:
            self._symbol_to_surfaces[surface.underlying_symbol] = []
        
        if surface.surface_id not in self._symbol_to_surfaces[surface.underlying_symbol]:
            self._symbol_to_surfaces[surface.underlying_symbol].append(surface.surface_id)
        
        logger.info(f"波动率曲面已保存: {surface.surface_id}")
        return surface.surface_id
    
    def get_surface(self, surface_id: str) -> Optional[VolatilitySurface]:
        return self._storage.get(surface_id)
    
    def get_latest_surface(self, underlying_symbol: str) -> Optional[VolatilitySurface]:
        surface_ids = self._symbol_to_surfaces.get(underlying_symbol, [])
        if not surface_ids:
            return None
        
        surfaces = [self._storage[sid] for sid in surface_ids if sid in self._storage]
        if not surfaces:
            return None
        
        return max(surfaces, key=lambda s: s.calibration_date)
    
    def list_surfaces(self, underlying_symbol: Optional[str] = None) -> List[Dict]:
        if underlying_symbol:
            surface_ids = self._symbol_to_surfaces.get(underlying_symbol, [])
        else:
            surface_ids = list(self._storage.keys())
        
        return [
            {
                "surface_id": sid,
                "underlying_symbol": self._storage[sid].underlying_symbol,
                "calibration_date": self._storage[sid].calibration_date.isoformat(),
                "num_points": len(self._storage[sid].calibration_points)
            }
            for sid in surface_ids if sid in self._storage
        ]
    
    def delete_surface(self, surface_id: str) -> bool:
        if surface_id in self._storage:
            surface = self._storage[surface_id]
            symbol = surface.underlying_symbol
            
            del self._storage[surface_id]
            
            if symbol in self._symbol_to_surfaces:
                self._symbol_to_surfaces[symbol] = [
                    sid for sid in self._symbol_to_surfaces[symbol] if sid != surface_id
                ]
            
            logger.info(f"波动率曲面已删除: {surface_id}")
            return True
        return False

volatility_storage = VolatilitySurfaceStorage()
