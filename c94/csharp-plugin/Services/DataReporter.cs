using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using PlayerDataAnalytics.Models;

namespace PlayerDataAnalytics.Services
{
    public class DataReporter
    {
        private readonly HttpClient _httpClient;
        private readonly string _apiEndpoint;
        private readonly Queue<PlayerBehaviorData> _dataQueue;
        private int _currentBatchSize;
        private readonly int _minBatchSize;
        private readonly int _maxBatchSize;
        private bool _isReporting;
        private readonly TimeSpan _flushInterval;
        private DateTime _lastFlushTime;
        private readonly SemaphoreSlim _semaphore;
        private int _retryCount;
        private readonly int _maxRetryCount;
        private readonly Dictionary<string, List<PlayerBehaviorData>> _aggregationCache;
        private readonly int _aggregationThreshold;

        public DataReporter(string apiEndpoint, int minBatchSize = 20, int maxBatchSize = 200, 
                            int flushIntervalSeconds = 5, int maxRetryCount = 3, int aggregationThreshold = 5)
        {
            _apiEndpoint = apiEndpoint;
            _minBatchSize = minBatchSize;
            _maxBatchSize = maxBatchSize;
            _currentBatchSize = minBatchSize;
            _flushInterval = TimeSpan.FromSeconds(flushIntervalSeconds);
            _maxRetryCount = maxRetryCount;
            _aggregationThreshold = aggregationThreshold;
            
            _httpClient = new HttpClient();
            _httpClient.Timeout = TimeSpan.FromSeconds(30);
            _dataQueue = new Queue<PlayerBehaviorData>();
            _aggregationCache = new Dictionary<string, List<PlayerBehaviorData>>();
            _isReporting = false;
            _lastFlushTime = DateTime.Now;
            _semaphore = new SemaphoreSlim(1, 1);
            _retryCount = 0;

            _ = StartBackgroundFlushAsync();
        }

        public void EnqueueData(PlayerBehaviorData data)
        {
            var aggregated = TryAggregateData(data);
            if (aggregated) return;

            lock (_dataQueue)
            {
                _dataQueue.Enqueue(data);
            }

            if (_dataQueue.Count >= _currentBatchSize && !_isReporting)
            {
                _ = ReportBatchAsync();
            }
        }

        private bool TryAggregateData(PlayerBehaviorData newData)
        {
            if (newData.BehaviorType != "Move") return false;

            var key = $"{newData.PlayerId}_{newData.MapId}";
            
            lock (_aggregationCache)
            {
                if (!_aggregationCache.ContainsKey(key))
                {
                    _aggregationCache[key] = new List<PlayerBehaviorData>();
                }

                var playerData = _aggregationCache[key];
                
                if (playerData.Count >= _aggregationThreshold)
                {
                    var aggregated = AggregateMovements(playerData);
                    lock (_dataQueue)
                    {
                        _dataQueue.Enqueue(aggregated);
                    }
                    playerData.Clear();
                    return true;
                }

                playerData.Add(newData);
                return false;
            }
        }

        private PlayerBehaviorData AggregateMovements(List<PlayerBehaviorData> movements)
        {
            var first = movements.First();
            var last = movements.Last();
            
            return new PlayerBehaviorData
            {
                PlayerId = first.PlayerId,
                PlayerName = first.PlayerName,
                PlayerLevel = first.PlayerLevel,
                ServerId = first.ServerId,
                BehaviorType = "Move",
                Timestamp = last.Timestamp,
                MapId = first.MapId,
                PositionX = last.PositionX,
                PositionY = last.PositionY,
                PositionZ = last.PositionZ,
                MoveSpeed = movements.Average(m => m.MoveSpeed ?? 0),
                SessionId = first.SessionId
            };
        }

        private async Task StartBackgroundFlushAsync()
        {
            while (true)
            {
                await Task.Delay(1000);
                
                if ((DateTime.Now - _lastFlushTime) >= _flushInterval && _dataQueue.Count > 0 && !_isReporting)
                {
                    await ReportBatchAsync();
                }
            }
        }

        public async Task ReportBatchAsync()
        {
            if (!await _semaphore.WaitAsync(0)) return;

            try
            {
                _isReporting = true;
                _lastFlushTime = DateTime.Now;
                var batch = new List<PlayerBehaviorData>();

                lock (_dataQueue)
                {
                    var batchSize = Math.Min(_currentBatchSize, _dataQueue.Count);
                    for (int i = 0; i < batchSize; i++)
                    {
                        batch.Add(_dataQueue.Dequeue());
                    }
                }

                if (batch.Count > 0)
                {
                    await SendBatchWithRetryAsync(batch);
                    AdjustBatchSize(true);
                    _retryCount = 0;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Data report failed: {ex.Message}");
            }
            finally
            {
                _isReporting = false;
                _semaphore.Release();
            }
        }

        private async Task SendBatchWithRetryAsync(List<PlayerBehaviorData> batch)
        {
            for (int attempt = 0; attempt < _maxRetryCount; attempt++)
            {
                try
                {
                    var json = JsonConvert.SerializeObject(batch);
                    var compressedBytes = CompressString(json);
                    
                    var request = new HttpRequestMessage(HttpMethod.Post, $"{_apiEndpoint}/api/behavior/batch")
                    {
                        Content = new ByteArrayContent(compressedBytes)
                    };
                    request.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
                    request.Content.Headers.ContentEncoding.Add("gzip");

                    var response = await _httpClient.SendAsync(request);
                    response.EnsureSuccessStatusCode();
                    return;
                }
                catch (Exception ex)
                {
                    _retryCount++;
                    AdjustBatchSize(false);
                    
                    if (attempt == _maxRetryCount - 1)
                    {
                        lock (_dataQueue)
                        {
                            foreach (var data in batch.AsEnumerable().Reverse())
                            {
                                _dataQueue.Enqueue(data);
                            }
                        }
                        
                        if (_dataQueue.Count > _maxBatchSize * 2)
                        {
                            lock (_dataQueue)
                            {
                                var itemsToRemove = _dataQueue.Count / 2;
                                for (int i = 0; i < itemsToRemove; i++)
                                {
                                    _dataQueue.Dequeue();
                                }
                            }
                            Console.WriteLine("Queue overflow, dropping oldest data");
                        }
                        throw;
                    }

                    var delay = Math.Pow(2, attempt) * 1000;
                    await Task.Delay((int)delay);
                }
            }
        }

        private void AdjustBatchSize(bool success)
        {
            if (success)
            {
                if (_currentBatchSize < _maxBatchSize)
                {
                    _currentBatchSize = Math.Min(_currentBatchSize + 10, _maxBatchSize);
                }
            }
            else
            {
                _currentBatchSize = Math.Max(_currentBatchSize - 20, _minBatchSize);
            }
        }

        private byte[] CompressString(string str)
        {
            var bytes = Encoding.UTF8.GetBytes(str);
            using (var output = new MemoryStream())
            {
                using (var gzip = new GZipStream(output, CompressionMode.Compress, true))
                {
                    gzip.Write(bytes, 0, bytes.Length);
                }
                return output.ToArray();
            }
        }

        public async Task ReportSingleAsync(PlayerBehaviorData data)
        {
            try
            {
                var json = JsonConvert.SerializeObject(data);
                var compressedBytes = CompressString(json);
                
                var request = new HttpRequestMessage(HttpMethod.Post, $"{_apiEndpoint}/api/behavior")
                {
                    Content = new ByteArrayContent(compressedBytes)
                };
                request.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
                request.Content.Headers.ContentEncoding.Add("gzip");

                await _httpClient.SendAsync(request);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Single data report failed: {ex.Message}");
            }
        }

        public async Task FlushAllAsync()
        {
            while (_dataQueue.Count > 0)
            {
                await ReportBatchAsync();
                await Task.Delay(100);
            }
        }

        public int GetQueueSize()
        {
            return _dataQueue.Count;
        }
    }
}
