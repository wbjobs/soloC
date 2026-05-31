using System;
using PlayerDataAnalytics.Models;
using PlayerDataAnalytics.Services;

namespace PlayerDataAnalytics
{
    public class AnalyticsPlugin
    {
        private readonly DataReporter _dataReporter;
        private readonly string _serverId;
        private bool _isInitialized;

        public AnalyticsPlugin(string apiEndpoint, string serverId)
        {
            _serverId = serverId;
            _dataReporter = new DataReporter(apiEndpoint);
            _isInitialized = true;
        }

        public void TrackPlayerMovement(string playerId, string playerName, int playerLevel, 
            string mapId, float posX, float posY, float posZ, float moveSpeed, string sessionId)
        {
            if (!_isInitialized) return;

            var data = new PlayerBehaviorData
            {
                PlayerId = playerId,
                PlayerName = playerName,
                PlayerLevel = playerLevel,
                ServerId = _serverId,
                BehaviorType = nameof(BehaviorType.Move),
                Timestamp = DateTime.UtcNow,
                MapId = mapId,
                PositionX = posX,
                PositionY = posY,
                PositionZ = posZ,
                MoveSpeed = moveSpeed,
                SessionId = sessionId
            };

            _dataReporter.EnqueueData(data);
        }

        public void TrackSkillUse(string playerId, string playerName, int playerLevel,
            string mapId, float posX, float posY, float posZ,
            string skillId, string skillName, string sessionId)
        {
            if (!_isInitialized) return;

            var data = new PlayerBehaviorData
            {
                PlayerId = playerId,
                PlayerName = playerName,
                PlayerLevel = playerLevel,
                ServerId = _serverId,
                BehaviorType = nameof(BehaviorType.SkillUse),
                Timestamp = DateTime.UtcNow,
                MapId = mapId,
                PositionX = posX,
                PositionY = posY,
                PositionZ = posZ,
                SkillId = skillId,
                SkillName = skillName,
                SessionId = sessionId
            };

            _dataReporter.EnqueueData(data);
        }

        public void TrackTaskUpdate(string playerId, string playerName, int playerLevel,
            string mapId, string taskId, string taskName, int progress, string sessionId)
        {
            if (!_isInitialized) return;

            var data = new PlayerBehaviorData
            {
                PlayerId = playerId,
                PlayerName = playerName,
                PlayerLevel = playerLevel,
                ServerId = _serverId,
                BehaviorType = progress >= 100 ? nameof(BehaviorType.TaskComplete) : nameof(BehaviorType.TaskUpdate),
                Timestamp = DateTime.UtcNow,
                MapId = mapId,
                TaskId = taskId,
                TaskName = taskName,
                TaskProgress = progress,
                SessionId = sessionId
            };

            _dataReporter.EnqueueData(data);
        }

        public void TrackPlayerLogin(string playerId, string playerName, int playerLevel, string sessionId)
        {
            if (!_isInitialized) return;

            var data = new PlayerBehaviorData
            {
                PlayerId = playerId,
                PlayerName = playerName,
                PlayerLevel = playerLevel,
                ServerId = _serverId,
                BehaviorType = nameof(BehaviorType.Login),
                Timestamp = DateTime.UtcNow,
                SessionId = sessionId
            };

            _dataReporter.ReportSingleAsync(data).ConfigureAwait(false);
        }

        public void TrackPlayerLogout(string playerId, string playerName, int playerLevel, string sessionId)
        {
            if (!_isInitialized) return;

            var data = new PlayerBehaviorData
            {
                PlayerId = playerId,
                PlayerName = playerName,
                PlayerLevel = playerLevel,
                ServerId = _serverId,
                BehaviorType = nameof(BehaviorType.Logout),
                Timestamp = DateTime.UtcNow,
                SessionId = sessionId
            };

            _dataReporter.ReportSingleAsync(data).ConfigureAwait(false);
        }

        public void FlushData()
        {
            _dataReporter.FlushAllAsync().ConfigureAwait(false);
        }
    }
}
