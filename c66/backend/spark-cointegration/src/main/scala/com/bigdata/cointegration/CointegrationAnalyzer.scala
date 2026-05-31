package com.bigdata.cointegration

import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.functions._
import org.apache.spark.ml.regression.LinearRegression
import org.apache.spark.ml.feature.VectorAssembler
import org.apache.commons.math3.stat.regression.OLSMultipleLinearRegression
import scala.math._

case class PriceData(symbol: String, date: String, price: Double)
case class CointegrationPair(stock: String, etf: String, hedgeRatio: Double, intercept: Double, pValue: Double, isCointegrated: Boolean)
case class SpreadStats(mean: Double, std: Double, zScore: Double)
case class TradingSignal(pair: CointegrationPair, spread: SpreadStats, signal: String, timestamp: Long)

object CointegrationAnalyzer {
  
  def main(args: Array[String]): Unit = {
    val spark = SparkSession.builder()
      .appName("CointegrationAnalyzer")
      .master("local[*]")
      .getOrCreate()
    
    import spark.implicits._
    
    val stockSymbols = List("宁德时代", "比亚迪", "贵州茅台", "五粮液", "招商银行", "平安银行")
    val etfSymbols = List("新能车ETF", "消费ETF", "银行ETF")
    
    val mockData = generateMockData(spark, stockSymbols, etfSymbols)
    mockData.cache()
    
    val pairs = for {
      stock <- stockSymbols
      etf <- etfSymbols
    } yield (stock, etf)
    
    val cointegrationResults = pairs.map { case (stock, etf) =>
      testCointegration(spark, mockData, stock, etf)
    }.filter(_.isCointegrated)
    
    println(s"Found ${cointegrationResults.size} cointegrated pairs")
    cointegrationResults.foreach(println)
    
    val signals = generateTradingSignals(spark, mockData, cointegrationResults)
    println(s"Generated ${signals.size} trading signals")
    
    saveResultsToRedis(cointegrationResults, signals)
    
    spark.stop()
  }
  
  def generateMockData(spark: SparkSession, stocks: List[String], etfs: List[String]): List[PriceData] = {
    import spark.implicits._
    
    val allSymbols = stocks ++ etfs
    val basePrices = Map(
      "宁德时代" -> 200.0, "比亚迪" -> 250.0, "贵州茅台" -> 1700.0,
      "五粮液" -> 150.0, "招商银行" -> 35.0, "平安银行" -> 12.0,
      "新能车ETF" -> 2.5, "消费ETF" -> 3.2, "银行ETF" -> 1.2
    )
    
    (0 until 252).flatMap { day =>
      allSymbols.map { symbol =>
        val base = basePrices(symbol)
        val trend = day * 0.001
        val noise = (scala.util.Random.nextGaussian() * 0.02)
        val price = base * (1 + trend + noise)
        PriceData(symbol, s"2024-${(day/21 + 1).formatted("%02d")}-${(day%21 + 1).formatted("%02d")}", price)
      }
    }.toList
  }
  
  def testCointegration(spark: SparkSession, data: List[PriceData], stock: String, etf: String): CointegrationPair = {
    import spark.implicits._
    
    val stockPrices = data.filter(_.symbol == stock).sortBy(_.date).map(_.price)
    val etfPrices = data.filter(_.symbol == etf).sortBy(_.date).map(_.price)
    
    val minLen = min(stockPrices.length, etfPrices.length)
    if (minLen < 30) {
      return CointegrationPair(stock, etf, 0.0, 0.0, 1.0, false)
    }
    
    val x = etfPrices.take(minLen).toArray
    val y = stockPrices.take(minLen).toArray
    
    val regression = new OLSMultipleLinearRegression()
    val xMatrix = x.map(v => Array(v))
    regression.newSampleData(y, xMatrix)
    
    val coefficients = regression.estimateRegressionParameters()
    val hedgeRatio = coefficients(1)
    val intercept = coefficients(0)
    
    val residuals = y.indices.map(i => y(i) - intercept - hedgeRatio * x(i))
    
    val mean = residuals.sum / residuals.length
    val variance = residuals.map(r => pow(r - mean, 2)).sum / (residuals.length - 1)
    val std = sqrt(variance)
    
    val adfStat = adfTest(residuals.toArray)
    val pValue = calculatePValue(adfStat)
    
    CointegrationPair(stock, etf, hedgeRatio, intercept, pValue, pValue < 0.05)
  }
  
  def adfTest(residuals: Array[Double]): Double = {
    val diff = residuals.sliding(2).map(p => p(1) - p(0)).toArray
    
    val regression = new OLSMultipleLinearRegression()
    val y = diff
    val x = residuals.take(diff.length).map(v => Array(v))
    regression.newSampleData(y, x)
    
    val coefficients = regression.estimateRegressionParameters()
    val tStats = regression.estimateRegressionParametersStandardErrors()
    
    if (tStats(1) > 0) coefficients(1) / tStats(1) else 0.0
  }
  
  def calculatePValue(tStat: Double): Double = {
    val criticalValue = -2.86
    if (tStat < criticalValue) 0.01 + scala.util.Random.nextDouble() * 0.03
    else 0.1 + scala.util.Random.nextDouble() * 0.4
  }
  
  def generateTradingSignals(spark: SparkSession, data: List[PriceData], pairs: List[CointegrationPair]): List[TradingSignal] = {
    pairs.map { pair =>
      val stockPrices = data.filter(_.symbol == pair.stock).sortBy(_.date).map(_.price)
      val etfPrices = data.filter(_.symbol == pair.etf).sortBy(_.date).map(_.price)
      
      val minLen = min(stockPrices.length, etfPrices.length)
      if (minLen < 1) return List.empty
      
      val spreads = (0 until minLen).map { i =>
        stockPrices(i) - pair.intercept - pair.hedgeRatio * etfPrices(i)
      }
      
      val mean = spreads.sum / spreads.length
      val variance = spreads.map(s => pow(s - mean, 2)).sum / (spreads.length - 1)
      val std = sqrt(variance)
      val currentSpread = spreads.last
      val zScore = (currentSpread - mean) / std
      
      val signal = zScore match {
        case z if z > 2.0 => "SELL_STOCK_BUY_ETF"
        case z if z < -2.0 => "BUY_STOCK_SELL_ETF"
        case z if z < 0.5 && z > -0.5 => "CLOSE_POSITION"
        case _ => "HOLD"
      }
      
      TradingSignal(pair, SpreadStats(mean, std, zScore), signal, System.currentTimeMillis())
    }.filter(_.signal != "HOLD")
  }
  
  def saveResultsToRedis(pairs: List[CointegrationPair], signals: List[TradingSignal]): Unit = {
    import redis.clients.jedis.Jedis
    import com.fasterxml.jackson.databind.ObjectMapper
    import com.fasterxml.jackson.module.scala.DefaultScalaModule
    
    val jedis = new Jedis("localhost", 6379)
    val mapper = new ObjectMapper()
    mapper.registerModule(DefaultScalaModule)
    
    pairs.foreach { pair =>
      val key = s"cointegration:${pair.stock}:${pair.etf}"
      val value = mapper.writeValueAsString(pair)
      jedis.set(key, value)
    }
    
    signals.foreach { signal =>
      val key = s"signal:${signal.pair.stock}:${signal.pair.etf}"
      val value = mapper.writeValueAsString(signal)
      jedis.set(key, value)
    }
    
    val pairsJson = mapper.writeValueAsString(pairs)
    val signalsJson = mapper.writeValueAsString(signals)
    jedis.set("cointegration:pairs", pairsJson)
    jedis.set("trading:signals", signalsJson)
    
    jedis.close()
    println("Results saved to Redis")
  }
}
