import json
import re
import redis
from flask import Flask, jsonify, request, Response, stream_with_context
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
redis_client = redis.Redis(host='localhost', port=6379, db=0)

BATCH_SIZE = 100

def get_or_create_account():
    account_key = "simulation:account"
    if not redis_client.exists(account_key):
        account = {
            "cash": 1000000.0,
            "positions": {},
            "trades": [],
            "total_pnl": 0.0
        }
        redis_client.set(account_key, json.dumps(account))
    return json.loads(redis_client.get(account_key))

def save_account(account):
    redis_client.set("simulation:account", json.dumps(account))

def load_factor_batch(key, start, end):
    batch = redis_client.lrange(key, start, end)
    factors = []
    for data in reversed(batch):
        factors.append(json.loads(data))
    return factors

@app.route('/api/factors/<symbol>')
def get_factors(symbol):
    minutes = int(request.args.get('minutes', 5))
    page = int(request.args.get('page', 0))
    page_size = int(request.args.get('page_size', 300))
    
    key = f"factors:{symbol}"
    total = min(minutes * 60, redis_client.llen(key))
    
    start = page * page_size
    end = min(start + page_size, total)
    
    factors_data = redis_client.lrange(key, start, end - 1)
    
    factors = []
    for data in factors_data:
        factor = json.loads(data)
        factors.append({
            'symbol': factor['symbol'],
            'buyPressure': factor['buyPressure'],
            'sellPressure': factor['sellPressure'],
            'netFlow': factor['netFlow'],
            'largeOrderNetFlow': factor['largeOrderNetFlow'],
            'timestamp': factor['timestamp']
        })
    
    return jsonify({
        'data': factors,
        'page': page,
        'page_size': page_size,
        'total': total,
        'has_next': end < total
    })

@app.route('/api/factors/stream/<symbol>')
def stream_factors(symbol):
    def generate():
        key = f"factors:{symbol}"
        total = redis_client.llen(key)
        
        for start in range(0, total, BATCH_SIZE):
            end = min(start + BATCH_SIZE, total)
            batch = redis_client.lrange(key, start, end - 1)
            
            for data in reversed(batch):
                factor = json.loads(data)
                yield json.dumps({
                    'symbol': factor['symbol'],
                    'buyPressure': factor['buyPressure'],
                    'sellPressure': factor['sellPressure'],
                    'netFlow': factor['netFlow'],
                    'largeOrderNetFlow': factor['largeOrderNetFlow'],
                    'timestamp': factor['timestamp']
                }) + '\n'
    
    return Response(
        stream_with_context(generate()),
        mimetype='application/x-ndjson'
    )

@app.route('/api/backtest/<symbol>', methods=['POST'])
def run_backtest(symbol):
    data = request.json
    condition = data.get('condition', '')
    key = f"factors:{symbol}"
    total_factors = redis_client.llen(key)
    
    factor_a_match = re.search(r'因子A\s*([><]=?)\s*([\d.]+)', condition)
    factor_b_match = re.search(r'因子B\s*([><]=?)\s*([-]?[\d.]+)', condition)
    
    def generate_backtest():
        position = None
        trades = []
        entry_price = 0
        
        for batch_start in range(0, total_factors, BATCH_SIZE):
            batch_end = min(batch_start + BATCH_SIZE, total_factors)
            factors = load_factor_batch(key, batch_start, batch_end - 1)
            
            for i, factor in enumerate(factors):
                factor_a = factor['netFlow']
                factor_b = factor['largeOrderNetFlow']
                
                signal = False
                if factor_a_match and factor_b_match:
                    op_a, val_a = factor_a_match.groups()
                    op_b, val_b = factor_b_match.groups()
                    val_a = float(val_a)
                    val_b = float(val_b)
                    
                    cond_a = eval(f"{factor_a} {op_a} {val_a}")
                    cond_b = eval(f"{factor_b} {op_b} {val_b}")
                    signal = cond_a and cond_b
                
                global_idx = batch_start + len(factors) - 1 - i
                
                if signal and position is None:
                    position = 'long'
                    entry_price = 50000 + global_idx * 10
                    trades.append({
                        'timestamp': factor['timestamp'],
                        'action': 'buy',
                        'price': entry_price,
                        'factorA': factor_a,
                        'factorB': factor_b
                    })
                elif position == 'long' and global_idx > 0 and global_idx % 10 == 0:
                    exit_price = 50000 + global_idx * 10
                    trades.append({
                        'timestamp': factor['timestamp'],
                        'action': 'sell',
                        'price': exit_price,
                        'factorA': factor_a,
                        'factorB': factor_b
                    })
                    position = None
            
            win_count = sum(1 for i in range(0, len(trades), 2) 
                            if i + 1 < len(trades) and trades[i+1]['price'] > trades[i]['price'])
            loss_count = sum(1 for i in range(0, len(trades), 2) 
                             if i + 1 < len(trades) and trades[i+1]['price'] <= trades[i]['price'])
            
            total_return = 0
            for i in range(0, len(trades), 2):
                if i + 1 < len(trades):
                    total_return += (trades[i+1]['price'] - trades[i]['price']) / trades[i]['price'] * 100
            
            is_completed = batch_end >= total_factors
            
            yield json.dumps({
                'current': batch_end,
                'total': total_factors,
                'totalReturn': total_return,
                'winCount': win_count,
                'lossCount': loss_count,
                'trades': trades[-10:] if not is_completed else trades,
                'completed': is_completed
            }) + '\n'
    
    if data.get('stream', False):
        return Response(
            stream_with_context(generate_backtest()),
            mimetype='application/x-ndjson'
        )
    
    position = None
    trades = []
    
    for batch_start in range(0, total_factors, BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE, total_factors)
        factors = load_factor_batch(key, batch_start, batch_end - 1)
        
        for i, factor in enumerate(factors):
            factor_a = factor['netFlow']
            factor_b = factor['largeOrderNetFlow']
            
            signal = False
            if factor_a_match and factor_b_match:
                op_a, val_a = factor_a_match.groups()
                op_b, val_b = factor_b_match.groups()
                val_a = float(val_a)
                val_b = float(val_b)
                
                cond_a = eval(f"{factor_a} {op_a} {val_a}")
                cond_b = eval(f"{factor_b} {op_b} {val_b}")
                signal = cond_a and cond_b
            
            global_idx = batch_start + len(factors) - 1 - i
            
            if signal and position is None:
                position = 'long'
                entry_price = 50000 + global_idx * 10
                trades.append({
                    'timestamp': factor['timestamp'],
                    'action': 'buy',
                    'price': entry_price,
                    'factorA': factor_a,
                    'factorB': factor_b
                })
            elif position == 'long' and global_idx > 0 and global_idx % 10 == 0:
                exit_price = 50000 + global_idx * 10
                trades.append({
                    'timestamp': factor['timestamp'],
                    'action': 'sell',
                    'price': exit_price,
                    'factorA': factor_a,
                    'factorB': factor_b
                })
                position = None
    
    win_count = sum(1 for i in range(0, len(trades), 2) 
                    if i + 1 < len(trades) and trades[i+1]['price'] > trades[i]['price'])
    loss_count = sum(1 for i in range(0, len(trades), 2) 
                     if i + 1 < len(trades) and trades[i+1]['price'] <= trades[i]['price'])
    
    total_return = 0
    for i in range(0, len(trades), 2):
        if i + 1 < len(trades):
            total_return += (trades[i+1]['price'] - trades[i]['price']) / trades[i]['price'] * 100
    
    return jsonify({
        'trades': trades,
        'totalReturn': total_return,
        'winCount': win_count,
        'lossCount': loss_count
    })

@app.route('/api/cointegration/pairs')
def get_cointegration_pairs():
    pairs_data = redis_client.get("cointegration:pairs")
    if pairs_data:
        return jsonify(json.loads(pairs_data))
    return jsonify([])

@app.route('/api/cointegration/signals')
def get_trading_signals():
    signals_data = redis_client.get("trading:signals")
    if signals_data:
        return jsonify(json.loads(signals_data))
    return jsonify([])

@app.route('/api/cointegration/spread/<stock>/<etf>')
def get_spread_data(stock, etf):
    import random
    import numpy as np
    days = 100
    np.random.seed(hash(stock + etf) % 10000)
    
    mean = random.uniform(-5, 5)
    std = random.uniform(1, 3)
    
    spreads = []
    for i in range(days):
        spread = mean + np.random.normal(0, std)
        spreads.append({
            "day": i,
            "spread": spread,
            "mean": mean,
            "upper_band": mean + 2 * std,
            "lower_band": mean - 2 * std
        })
    
    return jsonify({
        "data": spreads,
        "mean": mean,
        "std": std,
        "currentZ": (spreads[-1]["spread"] - mean) / std
    })

@app.route('/api/account')
def get_account():
    account = get_or_create_account()
    return jsonify(account)

@app.route('/api/account/reset', methods=['POST'])
def reset_account():
    account = {
        "cash": 1000000.0,
        "positions": {},
        "trades": [],
        "total_pnl": 0.0
    }
    save_account(account)
    return jsonify({"success": True, "account": account})

@app.route('/api/account/copy-signal', methods=['POST'])
def copy_signal_to_account():
    data = request.json
    signal = data.get("signal")
    stock = data.get("stock")
    etf = data.get("etf")
    hedgeRatio = data.get("hedgeRatio", 1.0)
    
    account = get_or_create_account()
    
    stock_price = 200.0 + hash(stock) % 50
    etf_price = 2.0 + hash(etf) % 2
    
    position_size = min(account["cash"] * 0.1, 100000)
    quantity = int(position_size / stock_price)
    
    trade = {
        "timestamp": int(__import__('time').time() * 1000),
        "signal": signal,
        "stock": stock,
        "etf": etf,
        "stockPrice": stock_price,
        "etfPrice": etf_price,
        "hedgeRatio": hedgeRatio,
        "stockQuantity": quantity,
        "etfQuantity": int(quantity * hedgeRatio),
        "notional": quantity * stock_price + int(quantity * hedgeRatio) * etf_price
    }
    
    if signal == "BUY_STOCK_SELL_ETF":
        notional = quantity * stock_price
        if account["cash"] >= notional:
            account["cash"] -= notional
            if stock in account["positions"]:
                account["positions"][stock]["quantity"] += quantity
            else:
                account["positions"][stock] = {"quantity": quantity, "avgPrice": stock_price}
    
    elif signal == "SELL_STOCK_BUY_ETF":
        notional = int(quantity * hedgeRatio) * etf_price
        if account["cash"] >= notional:
            account["cash"] -= notional
            if etf in account["positions"]:
                account["positions"][etf]["quantity"] += int(quantity * hedgeRatio)
            else:
                account["positions"][etf] = {"quantity": int(quantity * hedgeRatio), "avgPrice": etf_price}
    
    account["trades"].append(trade)
    save_account(account)
    
    return jsonify({"success": True, "trade": trade, "account": account})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)
