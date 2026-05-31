namespace CityTrafficSim.Core;

public class Road
{
    public Vector2 Start { get; }
    public Vector2 End { get; }
    public float Width { get; }
    public int LanesPerDirection { get; }

    public Road(Vector2 start, Vector2 end, float width = 20f, int lanesPerDirection = 2)
    {
        Start = start;
        End = end;
        Width = width;
        LanesPerDirection = lanesPerDirection;
    }

    public float Length() => Vector2.Distance(Start, End);

    public Vector2 Direction() => (End - Start).Normalized();

    public Vector2 GetLaneOffset(int laneIndex, bool fromStart)
    {
        Vector2 dir = Direction();
        Vector2 normal = new Vector2(-dir.Y, dir.X);
        float laneWidth = Width / (LanesPerDirection * 2);
        float offset = (laneIndex + 0.5f) * laneWidth - Width / 2;
        return fromStart ? normal * offset : normal * -offset;
    }
}
