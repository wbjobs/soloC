namespace CityTrafficSim.Core;

public enum LightState
{
    Red,
    Yellow,
    Green
}

public enum Direction
{
    Horizontal,
    Vertical
}

public class TrafficLight
{
    public Vector2 Position { get; }
    public LightState HorizontalState { get; private set; }
    public LightState VerticalState { get; private set; }
    
    private float _timer;
    private readonly float _greenDuration;
    private readonly float _yellowDuration;
    private Direction _currentGreenDirection;

    public TrafficLight(Vector2 position, float greenDuration = 5f, float yellowDuration = 1.5f)
    {
        Position = position;
        _greenDuration = greenDuration;
        _yellowDuration = yellowDuration;
        _timer = 0f;
        _currentGreenDirection = Direction.Horizontal;
        HorizontalState = LightState.Green;
        VerticalState = LightState.Red;
    }

    public void Update(float deltaTime)
    {
        _timer += deltaTime;

        if (_currentGreenDirection == Direction.Horizontal)
        {
            if (HorizontalState == LightState.Green && _timer >= _greenDuration)
            {
                HorizontalState = LightState.Yellow;
                _timer = 0f;
            }
            else if (HorizontalState == LightState.Yellow && _timer >= _yellowDuration)
            {
                HorizontalState = LightState.Red;
                VerticalState = LightState.Green;
                _currentGreenDirection = Direction.Vertical;
                _timer = 0f;
            }
        }
        else
        {
            if (VerticalState == LightState.Green && _timer >= _greenDuration)
            {
                VerticalState = LightState.Yellow;
                _timer = 0f;
            }
            else if (VerticalState == LightState.Yellow && _timer >= _yellowDuration)
            {
                VerticalState = LightState.Red;
                HorizontalState = LightState.Green;
                _currentGreenDirection = Direction.Horizontal;
                _timer = 0f;
            }
        }
    }

    public LightState GetLightStateForDirection(Vector2 direction)
    {
        float absX = Math.Abs(direction.X);
        float absY = Math.Abs(direction.Y);
        
        if (absX > absY)
        {
            return HorizontalState;
        }
        else
        {
            return VerticalState;
        }
    }

    public bool ShouldStop(Vector2 direction)
    {
        var state = GetLightStateForDirection(direction);
        return state == LightState.Red || state == LightState.Yellow;
    }
}
