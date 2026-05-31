namespace CityTrafficSim.Core;

public class RoadNetworkGenerator
{
    private readonly Random _random;

    public RoadNetworkGenerator(int? seed = null)
    {
        _random = seed.HasValue ? new Random(seed.Value) : new Random();
    }

    public List<Road> GenerateGridNetwork(int width, int height, float cellSize = 100f)
    {
        var roads = new List<Road>();
        float startX = -width * cellSize / 2;
        float startY = -height * cellSize / 2;

        for (int i = 0; i <= width; i++)
        {
            float x = startX + i * cellSize;
            roads.Add(new Road(new Vector2(x, startY), new Vector2(x, -startY)));
        }

        for (int j = 0; j <= height; j++)
        {
            float y = startY + j * cellSize;
            roads.Add(new Road(new Vector2(startX, y), new Vector2(-startX, y)));
        }

        return roads;
    }

    public List<Road> GenerateLSystemNetwork(int iterations = 5, float initialAngle = 0f, float stepLength = 80f, float angleStep = 90f)
    {
        var roads = new List<Road>();
        var lSystem = LSystem.CreateCityRoadSystem(_random.Next());
        string commands = lSystem.Generate(iterations);

        var positionStack = new Stack<Vector2>();
        var angleStack = new Stack<float>();
        Vector2 currentPosition = Vector2.Zero;
        float currentAngle = initialAngle;
        float minSegmentLength = stepLength * 0.5f;

        foreach (char cmd in commands)
        {
            switch (cmd)
            {
                case 'F':
                    float angleRad = currentAngle * (float)Math.PI / 180f;
                    Vector2 direction = new Vector2((float)Math.Cos(angleRad), (float)Math.Sin(angleRad));
                    float segmentLength = stepLength * (0.7f + (float)(_random.NextDouble() * 0.6f));
                    segmentLength = Math.Max(segmentLength, minSegmentLength);
                    Vector2 newPosition = currentPosition + direction * segmentLength;
                    
                    if (Vector2.Distance(currentPosition, newPosition) > 1f)
                    {
                        roads.Add(new Road(currentPosition, newPosition));
                    }
                    currentPosition = newPosition;
                    break;

                case '+':
                    currentAngle += angleStep * (0.8f + (float)(_random.NextDouble() * 0.4f));
                    break;

                case '-':
                    currentAngle -= angleStep * (0.8f + (float)(_random.NextDouble() * 0.4f));
                    break;

                case '[':
                    positionStack.Push(currentPosition);
                    angleStack.Push(currentAngle);
                    break;

                case ']':
                    currentPosition = positionStack.Pop();
                    currentAngle = angleStack.Pop();
                    break;
            }
        }

        return MergeOverlappingRoads(roads);
    }

    private List<Road> MergeOverlappingRoads(List<Road> roads)
    {
        var merged = new List<Road>();
        float mergeThreshold = 10f;

        foreach (var road in roads)
        {
            bool shouldAdd = true;
            for (int i = merged.Count - 1; i >= 0; i--)
            {
                var existing = merged[i];
                float dist1 = Vector2.Distance(road.Start, existing.Start);
                float dist2 = Vector2.Distance(road.End, existing.End);
                float dist3 = Vector2.Distance(road.Start, existing.End);
                float dist4 = Vector2.Distance(road.End, existing.Start);

                if ((dist1 < mergeThreshold && dist2 < mergeThreshold) ||
                    (dist3 < mergeThreshold && dist4 < mergeThreshold))
                {
                    shouldAdd = false;
                    break;
                }
            }

            if (shouldAdd)
            {
                merged.Add(road);
            }
        }

        return merged;
    }

    public List<Vector2> FindIntersections(List<Road> roads)
    {
        var intersections = new List<Vector2>();
        float threshold = 15f;

        for (int i = 0; i < roads.Count; i++)
        {
            for (int j = i + 1; j < roads.Count; j++)
            {
                var road1 = roads[i];
                var road2 = roads[j];

                var points = new[] { road1.Start, road1.End, road2.Start, road2.End };
                for (int p = 0; p < points.Length; p++)
                {
                    for (int q = p + 1; q < points.Length; q++)
                    {
                        if (Vector2.Distance(points[p], points[q]) < threshold)
                        {
                            bool exists = false;
                            foreach (var existing in intersections)
                            {
                                if (Vector2.Distance(existing, points[p]) < threshold)
                                {
                                    exists = true;
                                    break;
                                }
                            }
                            if (!exists)
                            {
                                intersections.Add(points[p]);
                            }
                        }
                    }
                }
            }
        }

        return intersections;
    }
}
