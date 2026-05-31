import asyncio
import time
from typing import Dict, List
from dataclasses import dataclass
from datetime import datetime

from black_scholes import price_option, OptionInputs, OptionType
from event_store import event_store
from database import SessionLocal, save_pricing_record
import metrics

@dataclass
class OptionContract:
    contract_symbol: str
    underlying_symbol: str
    K: float
    T: float
    r: float
    sigma: float
    option_type: OptionType

class OptionPricingEngine:
    def __init__(self):
        self.contracts: Dict[str, OptionContract] = {}
        self.running = False
        self.db_session = SessionLocal()
    
    def add_contract(self, contract: OptionContract):
        self.contracts[contract.contract_symbol] = contract
        metrics.active_contracts.set(len(self.contracts))
        print(f"Added contract: {contract.contract_symbol}. Total contracts: {len(self.contracts)}")
    
    def remove_contract(self, contract_symbol: str):
        if contract_symbol in self.contracts:
            del self.contracts[contract_symbol]
            metrics.active_contracts.set(len(self.contracts))
            print(f"Removed contract: {contract_symbol}. Total contracts: {len(self.contracts)}")
    
    async def calculate_single_contract(self, contract: OptionContract, S: float, timestamp: float):
        inputs = OptionInputs(
            S=S,
            K=contract.K,
            T=contract.T,
            r=contract.r,
            sigma=contract.sigma,
            option_type=contract.option_type,
            contract_symbol=contract.contract_symbol
        )
        
        with metrics.pricing_duration_seconds.labels(contract_symbol=contract.contract_symbol).time():
            result = price_option(inputs, timestamp)
        
        save_pricing_record(self.db_session, result)
        metrics.increment_database_writes("option_pricing_records")
        
        event_store.publish_option_pricing(result)
        metrics.increment_events_published("option_pricing")
        
        metrics.update_option_metrics(result)
        
        return result
    
    async def process_price_updates(self):
        last_processed_time = {}
        symbols = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA"]
        
        while self.running:
            try:
                tasks = []
                current_timestamp = time.time()
                
                for symbol in symbols:
                    price_data = event_store.get_latest_price(symbol)
                    if not price_data:
                        continue
                    
                    price = price_data["price"]
                    price_timestamp = price_data["timestamp"]
                    
                    if last_processed_time.get(symbol, 0) < price_timestamp:
                        last_processed_time[symbol] = price_timestamp
                        metrics.update_stock_price_metric(symbol, price)
                        
                        for contract in self.contracts.values():
                            if contract.underlying_symbol == symbol:
                                task = self.calculate_single_contract(
                                    contract, price, current_timestamp
                                )
                                tasks.append(task)
                
                if tasks:
                    await asyncio.gather(*tasks, return_exceptions=True)
                
                await asyncio.sleep(0.1)
            except Exception as e:
                print(f"Error processing price updates: {e}")
                await asyncio.sleep(1)
    
    async def run(self):
        self.running = True
        print("Option Pricing Engine started")
        
        await self.process_price_updates()
    
    def stop(self):
        self.running = False
        self.db_session.close()
        print("Option Pricing Engine stopped")

pricing_engine = OptionPricingEngine()

def initialize_sample_contracts():
    contracts = [
        OptionContract(
            contract_symbol="AAPL-C-190",
            underlying_symbol="AAPL",
            K=190.0,
            T=0.25,
            r=0.05,
            sigma=0.25,
            option_type=OptionType.CALL
        ),
        OptionContract(
            contract_symbol="AAPL-P-180",
            underlying_symbol="AAPL",
            K=180.0,
            T=0.25,
            r=0.05,
            sigma=0.25,
            option_type=OptionType.PUT
        ),
        OptionContract(
            contract_symbol="MSFT-C-380",
            underlying_symbol="MSFT",
            K=380.0,
            T=0.25,
            r=0.05,
            sigma=0.22,
            option_type=OptionType.CALL
        ),
        OptionContract(
            contract_symbol="GOOGL-C-145",
            underlying_symbol="GOOGL",
            K=145.0,
            T=0.25,
            r=0.05,
            sigma=0.28,
            option_type=OptionType.CALL
        ),
        OptionContract(
            contract_symbol="TSLA-C-260",
            underlying_symbol="TSLA",
            K=260.0,
            T=0.25,
            r=0.05,
            sigma=0.35,
            option_type=OptionType.CALL
        )
    ]
    
    for contract in contracts:
        pricing_engine.add_contract(contract)
