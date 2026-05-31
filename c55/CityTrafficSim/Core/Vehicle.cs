namespace CityTrafficSim.Core;

public class Vehicle
{
    public Vector2 Position { get; set; }
    public Vector2 Velocity { get; set; }
    public float MaxSpeed { get; set; }
    public float Acceleration { get; set; }
    public float Length { get; set; }
    public float Width { get; set; }
    public Color Color { get; set; }
    public int Id { get; }

    private Road? _currentRoad;
    private int _currentLane;
    private float _roadProgress;
    private bool _reverseDirection;
    private bool _isWaitingAtIntersection;
    private bool _isWaitingForLight;
    private Vector2? _targetIntersection;
    private List<Road>? _allRoads;
    private IntersectionManager? _intersectionManager;
    private TrafficLightManager? _trafficLightManager;
    private static int _nextId = 1;

    public Vehicle(Vector2 position, float maxSpeed = 50f)
    {
        Id = _nextId++;
        Position = position;
        Velocity = Vector2.Zero;
        MaxSpeed = maxSpeed;
        Acceleration = 20f;
        Length = 12f;
        Width = 6f;
        Color = Color.Random();
        _isWaitingAtIntersection = false;
        _isWaitingForLight = false;
    }

    public void SetRoad(Road road, int lane, bool reverse = false)
    {
        _currentRoad = road;
        _currentLane = lane;
        _reverseDirection = reverse;
        _roadProgress = 0f;
        _isWaitingAtIntersection = false;
        _targetIntersection = null;

        Vector2 offset = road.GetLaneOffset(lane, !reverse);
        Position = (reverse ? road.End : road.Start) + offset;
    }

    public void SetEnvironment(List<Road> allRoads, IntersectionManager intersectionManager, TrafficLightManager trafficLightManager)
    {
        _allRoads = allRoads;
        _intersectionManager = intersectionManager;
        _trafficLightManager = trafficLightManager;
    }

    public void Update(float deltaTime, List<Vehicle> vehicles, List<Vector2> intersections)
    {
        if (_currentRoad == null || _allRoads == null || _intersectionManager == null || _trafficLightManager == null) return;

        float roadLength = _currentRoad.Length();
        Vector2 roadDir = _currentRoad.Direction();
        if (_reverseDirection) roadDir = roadDir * -1f;

        Vector2 endPoint = _reverseDirection ? _currentRoad.Start : _currentRoad.End;
        Vector2? currentIntersection = FindNearestIntersection(endPoint, intersections);

        float speedFactor = 1f;
        float distToEnd = roadLength - _roadProgress;

        if (currentIntersection.HasValue && distToEnd < 60f)
        {
            bool shouldStopForLight = _trafficLightManager.ShouldStopAtIntersection(Position, roadDir, currentIntersection.Value);
            
            if (shouldStopForLight && distToEnd < 35f)
            {
                _isWaitingForLight = true;
                speedFactor = 0f;
            }
            else if (distToEnd < 25f)
            {
                _isWaitingForLight = false;
                
                if (!_isWaitingAtIntersection)
                {
                    _isWaitingAtIntersection = true;
                    _targetIntersection = currentIntersection;
                }

                if (!_intersectionManager.CanEnterIntersection(this, currentIntersection.Value))
                {
                    speedFactor = 0f;
                }
                else
                {
                    speedFactor = 0.4f;
                }
            }
            else
            {
                _isWaitingForLight = false;
                speedFactor = Math.Max(0.4f, distToEnd / 60f);
            }
        }
        else
        {
            _isWaitingForLight = false;
            if (_isWaitingAtIntersection && _targetIntersection.HasValue)
            {
                _intersectionManager.ExitIntersection(this, _targetIntersection.Value);
                _isWaitingAtIntersection = false;
                _targetIntersection = null;
            }
        }

        float safeDistance = 35f;
        foreach (var other in vehicles)
        {
            if (other == this) continue;
            float dist = Vector2.Distance(Position, other.Position);
            if (dist < safeDistance)
            {
                Vector2 toOther = other.Position - Position;
                float dot = Vector2.Dot(toOther.Normalized(), roadDir);
                if (dot > 0.5f)
                {
                    speedFactor = Math.Min(speedFactor, Math.Max(0f, (dist - 10f) / safeDistance));
                }
            }
        }

        float targetSpeed = MaxSpeed * speedFactor;
        Vector2 targetVelocity = roadDir * targetSpeed;

        Velocity += (targetVelocity - Velocity) * Acceleration * deltaTime;
        _roadProgress += Velocity.Length() * deltaTime;

        if (_roadProgress >= roadLength - 5f && speedFactor > 0.1f)
        {
            ChooseNextRoad();
        }

        Vector2 offset = _currentRoad.GetLaneOffset(_currentLane, !_reverseDirection);
        Vector2 basePos = _reverseDirection ? _currentRoad.End : _currentRoad.Start;
        Vector2 targetPosOnRoad = basePos + roadDir * _roadProgress + offset;
        Position = targetPosOnRoad;
    }

    private Vector2? FindNearestIntersection(Vector2 point, List<Vector2> intersections)
    {
        float minDist = float.MaxValue;
        Vector2? nearest = null;

        foreach (var intersection in intersections)
        {
            float dist = Vector2.Distance(point, intersection);
            if (dist < 30f && dist < minDist)
            {
                minDist = dist;
                nearest = intersection;
            }
        }

        return nearest;
    }

    private void ChooseNextRoad()
    {
        if (_currentRoad == null || _allRoads == null) return;

        bool atEnd = !_reverseDirection;
        var connectedRoads = IntersectionManager.FindConnectedRoads(_currentRoad, atEnd, _allRoads);

        if (connectedRoads.Count == 0)
        {
            _reverseDirection = !_reverseDirection;
            _roadProgress = 0f;
            return;
        }

        Random random = new Random();
        Road nextRoad = connectedRoads[random.Next(connectedRoads.Count)];
        
        Vector2 currentEnd = atEnd ? _currentRoad.End : _currentRoad.Start;
        bool enterFromStart = Vector2.Distance(currentEnd, nextRoad.Start) < 30f;
        
        int newLane = random.Next(nextRoad.LanesPerDirection);
        
        SetRoad(nextRoad, newLane, !enterFromStart);
    }

    public float GetRotation()
    {
        if (_currentRoad == null) return 0f;
        Vector2 dir = _currentRoad.Direction();
        if (_reverseDirection) dir = dir * -1f;
        return (float)Math.Atan2(dir.Y, dir.X) * 180f / (float)Math.PI;
    }
}

public struct Color
{
    public byte R { get; }
    public byte G { get; }
    public byte B { get; }

    public Color(byte r, byte g, byte b)
    {
        R = r;
        G = g;
        B = b;
    }

    public static Color Random()
    {
        Random random = new Random();
        return new Color(
            (byte)random.Next(100, 256),
            (byte)random.Next(100, 256),
            (byte)random.Next(100, 256)
        );
    }
}
