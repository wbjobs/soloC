import sys
import os
import json
import re
from datetime import datetime, timedelta
from concurrent import futures

import grpc
import redis

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'generated'))
import factor_pb2
import factor_pb2_grpc

class FactorService(factor_pb2_grpc.FactorServiceServicer):
    def __init__(self):
        self.redis = redis.Redis(host='localhost', port=6379, db=0)
    
    def GetRecentFactors(self, request, context):
        key = f"factors:{request.symbol}"
        factors_data = self.redis.lrange(key, 0, request.minutes * 60)
        
        factors = []
        for data in factors_data:
            factor = json.loads(data)
            factors.append(factor_pb2.FactorData(
                symbol=factor['symbol'],
                buy_pressure=factor['buyPressure'],
                sell_pressure=factor['sellPressure'],
                net_flow=factor['netFlow'],
                large_order_net_flow=factor['largeOrderNetFlow'],
                timestamp=factor['timestamp']
            ))
        
        return factor_pb2.GetRecentFactorsResponse(factors=factors)
    
    def GetHistoricalFactors(self, request, context):
        key = f"factors:{request.symbol}"
        total_factors = self.redis.llen(key)
        batch_size = request.page_size or 100
        
        for start in range(0, total_factors, batch_size):
            end = min(start + batch_size, total_factors)
            batch = self.redis.lrange(key, start, end - 1)
            
            for data in reversed(batch):
                factor = json.loads(data)
                yield factor_pb2.FactorData(
                    symbol=factor['symbol'],
                    buy_pressure=factor['buyPressure'],
                    sell_pressure=factor['sellPressure'],
                    net_flow=factor['netFlow'],
                    large_order_net_flow=factor['largeOrderNetFlow'],
                    timestamp=factor['timestamp']
                )
    
    def StreamFactors(self, request, context):
        key = f"factors:{request.symbol}"
        batch_size = request.batch_size or 50
        total_factors = self.redis.llen(key)
        
        for start in range(0, total_factors, batch_size):
            end = min(start + batch_size, total_factors)
            batch = self.redis.lrange(key, start, end - 1)
            
            for data in reversed(batch):
                factor = json.loads(data)
                yield factor_pb2.FactorData(
                    symbol=factor['symbol'],
                    buy_pressure=factor['buyPressure'],
                    sell_pressure=factor['sellPressure'],
                    net_flow=factor['netFlow'],
                    large_order_net_flow=factor['largeOrderNetFlow'],
                    timestamp=factor['timestamp']
                )
    
    def RunBacktest(self, request, context):
        key = f"factors:{request.symbol}"
        total_factors = self.redis.llen(key)
        
        condition = request.strategy.condition
        factor_a_match = re.search(r'因子A\s*([><]=?)\s*([\d.]+)', condition)
        factor_b_match = re.search(r'因子B\s*([><]=?)\s*([-]?[\d.]+)', condition)
        
        position = None
        trades = []
        batch_size = 100
        
        for batch_start in range(0, total_factors, batch_size):
            batch_end = min(batch_start + batch_size, total_factors)
            batch_data = self.redis.lrange(key, batch_start, batch_end - 1)
            
            factors = []
            for data in reversed(batch_data):
                factors.append(json.loads(data))
            
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
                    trade = factor_pb2.Trade(
                        timestamp=factor['timestamp'],
                        action='buy',
                        price=entry_price,
                        factor_a=factor_a,
                        factor_b=factor_b
                    )
                    trades.append(trade)
                elif position == 'long' and global_idx > 0 and global_idx % 10 == 0:
                    exit_price = 50000 + global_idx * 10
                    trade = factor_pb2.Trade(
                        timestamp=factor['timestamp'],
                        action='sell',
                        price=exit_price,
                        factor_a=factor_a,
                        factor_b=factor_b
                    )
                    trades.append(trade)
                    position = None
            
            win_count = sum(1 for i in range(0, len(trades), 2) 
                            if i + 1 < len(trades) and trades[i+1].price > trades[i].price)
            loss_count = sum(1 for i in range(0, len(trades), 2) 
                             if i + 1 < len(trades) and trades[i+1].price <= trades[i].price)
            
            total_return = 0
            for i in range(0, len(trades), 2):
                if i + 1 < len(trades):
                    total_return += (trades[i+1].price - trades[i].price) / trades[i].price * 100
            
            is_completed = batch_end >= total_factors
            
            yield factor_pb2.BacktestProgress(
                current=batch_end,
                total=total_factors,
                total_return=total_return,
                win_count=win_count,
                loss_count=loss_count,
                trades=trades[-10:] if not is_completed else trades,
                completed=is_completed
            )

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    factor_pb2_grpc.add_FactorServiceServicer_to_server(FactorService(), server)
    server.add_insecure_port('[::]:50051')
    server.start()
    print("gRPC server started on port 50051")
    server.wait_for_termination()

if __name__ == '__main__':
    serve()
