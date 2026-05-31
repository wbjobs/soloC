namespace CityTrafficSim.Core;

public class TrafficSimulator
{
    public List<Road> Roads { get; private set; }
    public List<Vehicle> Vehicles { get; private set; }
    public List<Vector2> Intersections { get; private set; }
    public IntersectionManager IntersectionManager { get; private set; }
    public TrafficLightManager TrafficLightManager { get; private set; }

    private readonly Random _random;
    private float _spawnTimer;
    private const float SpawnInterval = 0.8f;
    private const int MaxVehicles = 40;

    public TrafficSimulator(int? seed = null)
    {
        _random = seed.HasValue ? new Random(seed.Value) : new Random();
        Roads = new List<Road>();
        Vehicles = new List<Vehicle>();
        Intersections = new List<Vector2>();
        IntersectionManager = new IntersectionManager();
        TrafficLightManager = new TrafficLightManager(6f, 1.5f);
        _spawnTimer = 0f;
    }

    public void Initialize()
    {
        var generator = new RoadNetworkGenerator(_random.Next());
        Roads = generator.GenerateGridNetwork(6, 6, 150f);
        Intersections = generator.FindIntersections(Roads);
        IntersectionManager.InitializeIntersections(Intersections);
        TrafficLightManager.InitializeIntersections(Intersections);
    }

    public void Update(float deltaTime)
    {
        TrafficLightManager.Update(deltaTime);
        IntersectionManager.Update(deltaTime);

        _spawnTimer += deltaTime;
        if (_spawnTimer >= SpawnInterval && Vehicles.Count < MaxVehicles)
        {
            SpawnVehicle();
            _spawnTimer = 0f;
        }

        foreach (var vehicle in Vehicles)
        {
            vehicle.Update(deltaTime, Vehicles, Intersections);
        }

        RemoveStuckVehicles();
    }

    private void RemoveStuckVehicles()
    {
        Vehicles.RemoveAll(v => 
        {
            float minX = float.MaxValue, maxX = float.MinValue;
            float minY = float.MaxValue, maxY = float.MinValue;
            foreach (var road in Roads)
            {
                minX = Math.Min(minX, Math.Min(road.Start.X, road.End.X));
                maxX = Math.Max(maxX, Math.Max(road.Start.X, road.End.X));
                minY = Math.Min(minY, Math.Min(road.Start.Y, road.End.Y));
                maxY = Math.Max(maxY, Math.Max(road.Start.Y, road.End.Y));
            }
            return v.Position.X < minX - 100 || v.Position.X > maxX + 100 ||
                   v.Position.Y < minY - 100 || v.Position.Y > maxY + 100;
        });
    }

    private void SpawnVehicle()
    {
        if (Roads.Count == 0) return;

        int roadIndex = _random.Next(Roads.Count);
        Road road = Roads[roadIndex];
        int lane = _random.Next(road.LanesPerDirection);
        bool reverse = _random.Next(2) == 0;

        var vehicle = new Vehicle(Vector2.Zero, 45f + (float)(_random.NextDouble() * 25f));
        vehicle.SetRoad(road, lane, reverse);
        vehicle.SetEnvironment(Roads, IntersectionManager, TrafficLightManager);
        Vehicles.Add(vehicle);
    }
}
