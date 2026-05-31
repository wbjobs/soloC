namespace CityTrafficSim.Core;

public struct Vector2
{
    public float X { get; set; }
    public float Y { get; set; }

    public Vector2(float x, float y)
    {
        X = x;
        Y = y;
    }

    public static Vector2 Zero => new Vector2(0, 0);
    public static Vector2 One => new Vector2(1, 1);
    public static Vector2 UnitX => new Vector2(1, 0);
    public static Vector2 UnitY => new Vector2(0, 1);

    public float Length() => (float)Math.Sqrt(X * X + Y * Y);
    public float LengthSquared() => X * X + Y * Y;

    public Vector2 Normalized()
    {
        float len = Length();
        return len > 0 ? new Vector2(X / len, Y / len) : Zero;
    }

    public static float Distance(Vector2 a, Vector2 b)
    {
        float dx = a.X - b.X;
        float dy = a.Y - b.Y;
        return (float)Math.Sqrt(dx * dx + dy * dy);
    }

    public static float Dot(Vector2 a, Vector2 b) => a.X * b.X + a.Y * b.Y;

    public static Vector2 operator +(Vector2 a, Vector2 b) => new Vector2(a.X + b.X, a.Y + b.Y);
    public static Vector2 operator -(Vector2 a, Vector2 b) => new Vector2(a.X - b.X, a.Y - b.Y);
    public static Vector2 operator *(Vector2 v, float s) => new Vector2(v.X * s, v.Y * s);
    public static Vector2 operator /(Vector2 v, float s) => new Vector2(v.X / s, v.Y / s);
}
