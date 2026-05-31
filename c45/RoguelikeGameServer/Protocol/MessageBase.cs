using System.Text.Json;
using System.Text.Json.Serialization;

namespace RoguelikeGameServer.Protocol;

public abstract class MessageBase
{
    [JsonPropertyName("type")]
    public int Type { get; set; }
    
    public static string Serialize<T>(T message) where T : MessageBase
    {
        return JsonSerializer.Serialize(message);
    }
    
    public static T? Deserialize<T>(string json) where T : MessageBase
    {
        return JsonSerializer.Deserialize<T>(json);
    }
    
    public static MessageBase? Deserialize(string json)
    {
        var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("type", out var typeElement))
            return null;
        
        var type = (MessageType)typeElement.GetInt32();
        return type switch
        {
            MessageType.C2S_Login => JsonSerializer.Deserialize<C2S_Login>(json),
            MessageType.C2S_CreateRoom => JsonSerializer.Deserialize<C2S_CreateRoom>(json),
            MessageType.C2S_JoinRoom => JsonSerializer.Deserialize<C2S_JoinRoom>(json),
            MessageType.C2S_StartGame => JsonSerializer.Deserialize<C2S_StartGame>(json),
            MessageType.C2S_PlayerMove => JsonSerializer.Deserialize<C2S_PlayerMove>(json),
            MessageType.C2S_PlayerAttack => JsonSerializer.Deserialize<C2S_PlayerAttack>(json),
            _ => null
        };
    }
}
