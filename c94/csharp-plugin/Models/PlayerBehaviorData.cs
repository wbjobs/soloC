using System;

namespace PlayerDataAnalytics.Models
{
    public class PlayerBehaviorData
    {
        public string PlayerId { get; set; }
        public string PlayerName { get; set; }
        public int PlayerLevel { get; set; }
        public string ServerId { get; set; }
        public string BehaviorType { get; set; }
        public DateTime Timestamp { get; set; }
        public string MapId { get; set; }
        public float PositionX { get; set; }
        public float PositionY { get; set; }
        public float PositionZ { get; set; }
        public string? SkillId { get; set; }
        public string? SkillName { get; set; }
        public string? TaskId { get; set; }
        public string? TaskName { get; set; }
        public int? TaskProgress { get; set; }
        public float? MoveSpeed { get; set; }
        public string SessionId { get; set; }
    }

    public enum BehaviorType
    {
        Move,
        SkillUse,
        TaskUpdate,
        TaskComplete,
        Login,
        Logout,
        Combat,
        ItemUse
    }
}
