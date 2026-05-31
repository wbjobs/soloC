import math
import numpy as np
from scipy.stats import norm
from typing import Dict, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import warnings

class OptionType(Enum):
    CALL = "call"
    PUT = "put"

MIN_SIGMA = 0.001
MAX_SIGMA = 5.0
MIN_T = 1e-6
MIN_S = 0.01
MIN_K = 0.01

@dataclass
class OptionInputs:
    S: float
    K: float
    T: float
    r: float
    sigma: float
    option_type: OptionType
    contract_symbol: str

@dataclass
class Greeks:
    delta: float
    gamma: float
    theta: float
    vega: float
    rho: float

@dataclass
class OptionPricingResult:
    price: float
    greeks: Greeks
    inputs: OptionInputs
    timestamp: float

def clamp_inputs(S: float, K: float, T: float, r: float, sigma: float) -> Tuple[float, float, float, float, float]:
    S_clamped = max(MIN_S, S)
    K_clamped = max(MIN_K, K)
    T_clamped = max(MIN_T, T)
    r_clamped = max(-0.5, min(0.5, r))
    sigma_clamped = max(MIN_SIGMA, min(MAX_SIGMA, sigma))
    return S_clamped, K_clamped, T_clamped, r_clamped, sigma_clamped

def safe_isnan(x: float) -> bool:
    return x != x or x == float('inf') or x == float('-inf')

def safe_cdf(x: float) -> float:
    x_clamped = max(-10.0, min(10.0, x))
    return norm.cdf(x_clamped)

def safe_pdf(x: float) -> float:
    x_clamped = max(-10.0, min(10.0, x))
    return norm.pdf(x_clamped)

def calculate_d1_d2(S: float, K: float, T: float, r: float, sigma: float) -> Tuple[float, float]:
    S, K, T, r, sigma = clamp_inputs(S, K, T, r, sigma)
    
    numerator = math.log(S / K) + (r + 0.5 * sigma ** 2) * T
    denominator = sigma * math.sqrt(T)
    
    if abs(denominator) < 1e-10:
        if numerator > 0:
            d1 = 10.0
        elif numerator < 0:
            d1 = -10.0
        else:
            d1 = 0.0
    else:
        d1 = numerator / denominator
    
    d1 = max(-10.0, min(10.0, d1))
    d2 = d1 - sigma * math.sqrt(T)
    d2 = max(-10.0, min(10.0, d2))
    
    return d1, d2

def black_scholes_price(S: float, K: float, T: float, r: float, sigma: float, option_type: OptionType) -> float:
    if T <= 0:
        return max(S - K, 0) if option_type == OptionType.CALL else max(K - S, 0)
    
    S_orig, K_orig = S, K
    S, K, T, r, sigma = clamp_inputs(S, K, T, r, sigma)
    
    d1, d2 = calculate_d1_d2(S, K, T, r, sigma)
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        
        if option_type == OptionType.CALL:
            price = S * safe_cdf(d1) - K * math.exp(-r * T) * safe_cdf(d2)
        else:
            price = K * math.exp(-r * T) * safe_cdf(-d2) - S * safe_cdf(-d1)
        
        if safe_isnan(price):
            price = max(S_orig - K_orig, 0) if option_type == OptionType.CALL else max(K_orig - S_orig, 0)
    
    return max(0.0, price)

def calculate_delta(S: float, K: float, T: float, r: float, sigma: float, option_type: OptionType) -> float:
    if T <= 0:
        return 1.0 if (option_type == OptionType.CALL and S > K) else (-1.0 if (option_type == OptionType.PUT and S < K) else 0.0)
    
    S, K, T, r, sigma = clamp_inputs(S, K, T, r, sigma)
    
    d1, _ = calculate_d1_d2(S, K, T, r, sigma)
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        
        if option_type == OptionType.CALL:
            delta = safe_cdf(d1)
        else:
            delta = safe_cdf(d1) - 1.0
        
        if safe_isnan(delta):
            delta = 0.5 if option_type == OptionType.CALL else -0.5
    
    return delta

def calculate_gamma(S: float, K: float, T: float, r: float, sigma: float) -> float:
    if T <= 0:
        return 0.0
    
    S, K, T, r, sigma = clamp_inputs(S, K, T, r, sigma)
    
    d1, _ = calculate_d1_d2(S, K, T, r, sigma)
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        
        denominator = S * sigma * math.sqrt(T)
        if abs(denominator) < 1e-10:
            gamma = 0.0
        else:
            gamma = safe_pdf(d1) / denominator
        
        if safe_isnan(gamma):
            gamma = 0.0
    
    return gamma

def calculate_theta(S: float, K: float, T: float, r: float, sigma: float, option_type: OptionType) -> float:
    if T <= 0:
        return 0.0
    
    S, K, T, r, sigma = clamp_inputs(S, K, T, r, sigma)
    
    d1, d2 = calculate_d1_d2(S, K, T, r, sigma)
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        
        sqrt_T = math.sqrt(T)
        if abs(sqrt_T) < 1e-10:
            term1 = 0.0
        else:
            term1 = -(S * safe_pdf(d1) * sigma) / (2 * sqrt_T)
        
        if option_type == OptionType.CALL:
            term2 = -r * K * math.exp(-r * T) * safe_cdf(d2)
            theta = term1 + term2
        else:
            term2 = r * K * math.exp(-r * T) * safe_cdf(-d2)
            theta = term1 + term2
        
        theta = theta / 365.0
        
        if safe_isnan(theta):
            theta = 0.0
    
    return theta

def calculate_vega(S: float, K: float, T: float, r: float, sigma: float) -> float:
    if T <= 0:
        return 0.0
    
    S, K, T, r, sigma = clamp_inputs(S, K, T, r, sigma)
    
    d1, _ = calculate_d1_d2(S, K, T, r, sigma)
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        
        vega = S * safe_pdf(d1) * math.sqrt(T) / 100.0
        
        if safe_isnan(vega):
            vega = 0.0
    
    return vega

def calculate_rho(S: float, K: float, T: float, r: float, sigma: float, option_type: OptionType) -> float:
    if T <= 0:
        return 0.0
    
    S, K, T, r, sigma = clamp_inputs(S, K, T, r, sigma)
    
    d1, d2 = calculate_d1_d2(S, K, T, r, sigma)
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        
        if option_type == OptionType.CALL:
            rho = K * T * math.exp(-r * T) * safe_cdf(d2) / 100.0
        else:
            rho = -K * T * math.exp(-r * T) * safe_cdf(-d2) / 100.0
        
        if safe_isnan(rho):
            rho = 0.0
    
    return rho

def calculate_greeks(S: float, K: float, T: float, r: float, sigma: float, option_type: OptionType) -> Greeks:
    return Greeks(
        delta=calculate_delta(S, K, T, r, sigma, option_type),
        gamma=calculate_gamma(S, K, T, r, sigma),
        theta=calculate_theta(S, K, T, r, sigma, option_type),
        vega=calculate_vega(S, K, T, r, sigma),
        rho=calculate_rho(S, K, T, r, sigma, option_type)
    )

def price_option(inputs: OptionInputs, timestamp: Optional[float] = None) -> OptionPricingResult:
    import time
    if timestamp is None:
        timestamp = time.time()
    
    price = black_scholes_price(
        inputs.S, inputs.K, inputs.T, inputs.r, inputs.sigma, inputs.option_type
    )
    greeks = calculate_greeks(
        inputs.S, inputs.K, inputs.T, inputs.r, inputs.sigma, inputs.option_type
    )
    
    return OptionPricingResult(
        price=price,
        greeks=greeks,
        inputs=inputs,
        timestamp=timestamp
    )

def generate_volatility_surface(
    S: float,
    r: float,
    strikes: np.ndarray,
    maturities: np.ndarray,
    base_volatility: float = 0.2
) -> Dict[str, list]:
    vol_surface = []
    price_surface = []
    
    for T in maturities:
        vol_row = []
        price_row = []
        for K in strikes:
            volatility_adj = base_volatility * (1 + 0.1 * abs(math.log(S / K)) + 0.05 * (1 - math.exp(-T)))
            price = black_scholes_price(S, K, T, r, volatility_adj, OptionType.CALL)
            vol_row.append(volatility_adj)
            price_row.append(price)
        vol_surface.append(vol_row)
        price_surface.append(price_row)
    
    return {
        "strikes": strikes.tolist(),
        "maturities": maturities.tolist(),
        "volatility_surface": vol_surface,
        "price_surface": price_surface
    }
