namespace CityTrafficSim.Core;

public class IntersectionManager
{
    private readonly Dictionary<Vector2, Queue<Vehicle>> _waitingVehicles;
    private readonly Dictionary<Vector2, float> _entryTimers;
    private const float EntryDelay = 1.5f;
    private const float ConnectionThreshold = 25f;

    public IntersectionManager()
    {
        _waitingVehicles = new Dictionary<Vector2, Queue<Vehicle>>();
        _entryTimers = new Dictionary<Vector2, float>();
    }

    public void InitializeIntersections(List<Vector2> intersections)
    {
        foreach (var intersection in intersections)
        {
            if (!_waitingVehicles.ContainsKey(intersection))
            {
                _waitingVehicles[intersection] = new Queue<Vehicle>();
                _entryTimers[intersection] = 0f;
            }
        }
    }

    public void Update(float deltaTime)
    {
        var keys = _entryTimers.Keys.ToList();
        foreach (var intersection in keys)
        {
            _entryTimers[intersection] += deltaTime;
        }
    }

    public bool CanEnterIntersection(Vehicle vehicle, Vector2 intersection)
    {
        if (!_waitingVehicles.ContainsKey(intersection))
            return true;

        var queue = _waitingVehicles[intersection];
        
        bool alreadyInQueue = false;
        foreach (var v in queue)
        {
            if (v.Id == vehicle.Id)
            {
                alreadyInQueue = true;
                break;
            }
        }
        
        if (!alreadyInQueue)
        {
            queue.Enqueue(vehicle);
        }

        if (queue.Count > 0 && queue.Peek().Id == vehicle.Id && _entryTimers[intersection] >= EntryDelay)
        {
            return true;
        }

        return false;
    }

    public void ExitIntersection(Vehicle vehicle, Vector2 intersection)
    {
        if (_waitingVehicles.TryGetValue(intersection, out var queue))
        {
            if (queue.Count > 0 && queue.Peek().Id == vehicle.Id)
            {
                queue.Dequeue();
                _entryTimers[intersection] = 0f;
            }
            else
            {
                var tempQueue = new Queue<Vehicle>();
                while (queue.Count > 0)
                {
                    var v = queue.Dequeue();
                    if (v.Id != vehicle.Id)
                    {
                        tempQueue.Enqueue(v);
                    }
                }
                while (tempQueue.Count > 0)
                {
                    queue.Enqueue(tempQueue.Dequeue());
                }
            }
        }
    }

    public static List<Road> FindConnectedRoads(Road currentRoad, bool atEnd, List<Road> allRoads)
    {
        var connected = new List<Road>();
        Vector2 currentPoint = atEnd ? currentRoad.End : currentRoad.Start;

        foreach (var road in allRoads)
        {
            if (road == currentRoad) continue;

            float distToStart = Vector2.Distance(currentPoint, road.Start);
            float distToEnd = Vector2.Distance(currentPoint, road.End);

            if (distToStart < ConnectionThreshold || distToEnd < ConnectionThreshold)
            {
                connected.Add(road);
            }
        }

        return connected;
    }
}
