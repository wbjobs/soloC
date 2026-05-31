namespace CityTrafficSim.Core;

public class TrafficLightManager
{
    private readonly Dictionary<Vector2, TrafficLight> _trafficLights;
    private readonly float _greenDuration;
    private readonly float _yellowDuration;

    public IReadOnlyCollection<TrafficLight> TrafficLights => _trafficLights.Values;

    public TrafficLightManager(float greenDuration = 5f, float yellowDuration = 1.5f)
    {
        _trafficLights = new Dictionary<Vector2, TrafficLight>();
        _greenDuration = greenDuration;
        _yellowDuration = yellowDuration;
    }

    public void InitializeIntersections(List<Vector2> intersections)
    {
        _trafficLights.Clear();
        foreach (var intersection in intersections)
        {
            var light = new TrafficLight(intersection, _greenDuration, _yellowDuration);
            _trafficLights[intersection] = light;
        }
    }

    public void Update(float deltaTime)
    {
        foreach (var light in _trafficLights.Values)
        {
            light.Update(deltaTime);
        }
    }

    public TrafficLight? GetTrafficLightAt(Vector2 position, float threshold = 30f)
    {
        foreach (var light in _trafficLights.Values)
        {
            if (Vector2.Distance(light.Position, position) < threshold)
            {
                return light;
            }
        }
        return null;
    }

    public bool ShouldStopAtIntersection(Vector2 vehiclePosition, Vector2 direction, Vector2 intersectionPosition)
    {
        var light = GetTrafficLightAt(intersectionPosition);
        if (light == null) return false;

        float distToIntersection = Vector2.Distance(vehiclePosition, intersectionPosition);
        if (distToIntersection > 50f) return false;

        return light.ShouldStop(direction);
    }

    public LightState? GetLightState(Vector2 intersectionPosition, Vector2 direction)
    {
        var light = GetTrafficLightAt(intersectionPosition);
        return light?.GetLightStateForDirection(direction);
    }
}
