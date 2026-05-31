namespace CityTrafficSim.Core;

public class LSystem
{
    private readonly Dictionary<char, string> _rules;
    private readonly string _axiom;
    private readonly Random _random;

    public LSystem(string axiom, Dictionary<char, string> rules, int? seed = null)
    {
        _axiom = axiom;
        _rules = rules;
        _random = seed.HasValue ? new Random(seed.Value) : new Random();
    }

    public string Generate(int iterations)
    {
        string current = _axiom;
        for (int i = 0; i < iterations; i++)
        {
            current = Iterate(current);
        }
        return current;
    }

    private string Iterate(string input)
    {
        var result = new System.Text.StringBuilder();
        foreach (char c in input)
        {
            if (_rules.TryGetValue(c, out string? replacement))
            {
                result.Append(replacement);
            }
            else
            {
                result.Append(c);
            }
        }
        return result.ToString();
    }

    public static LSystem CreateCityRoadSystem(int? seed = null)
    {
        var rules = new Dictionary<char, string>
        {
            { 'F', "F[+F][-F]F" },
            { 'X', "F[+X][-X]FX" }
        };
        return new LSystem("FX", rules, seed);
    }
}
