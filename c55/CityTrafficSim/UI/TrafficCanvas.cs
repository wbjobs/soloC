using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Rendering.SceneGraph;
using Avalonia.Threading;
using CityTrafficSim.Core;

namespace CityTrafficSim.UI;

public class TrafficCanvas : Control
{
    private readonly TrafficSimulator _simulator;
    private Vector2 _cameraOffset;
    private bool _isDragging;
    private Point _lastMousePos;
    private readonly DispatcherTimer _updateTimer;

    public TrafficCanvas()
    {
        _simulator = new TrafficSimulator();
        _simulator.Initialize();
        _cameraOffset = Vector2.Zero;

        _updateTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(16)
        };
        _updateTimer.Tick += (s, e) =>
        {
            _simulator.Update(0.016f);
            InvalidateVisual();
        };
        _updateTimer.Start();

        PointerPressed += (s, e) =>
        {
            _isDragging = true;
            _lastMousePos = e.GetPosition(this);
        };

        PointerMoved += (s, e) =>
        {
            if (_isDragging)
            {
                Point currentPos = e.GetPosition(this);
                _cameraOffset.X += (float)(currentPos.X - _lastMousePos.X);
                _cameraOffset.Y += (float)(currentPos.Y - _lastMousePos.Y);
                _lastMousePos = currentPos;
                InvalidateVisual();
            }
        };

        PointerReleased += (s, e) =>
        {
            _isDragging = false;
        };
    }

    public override void Render(DrawingContext context)
    {
        base.Render(context);

        if (Bounds.Width <= 0 || Bounds.Height <= 0) return;

        float centerX = (float)Bounds.Width / 2 + _cameraOffset.X;
        float centerY = (float)Bounds.Height / 2 + _cameraOffset.Y;

        context.DrawRectangle(Brushes.LightGray, null, Bounds);

        foreach (var road in _simulator.Roads)
        {
            Point start = WorldToScreen(road.Start, centerX, centerY);
            Point end = WorldToScreen(road.End, centerX, centerY);

            var roadPen = new Pen(Brushes.DarkGray, road.Width);
            context.DrawLine(roadPen, start, end);

            var lanePen = new Pen(Brushes.White, 1)
            {
                DashStyle = new DashStyle(new double[] { 5, 5 }, 0)
            };

            for (int i = 1; i < road.LanesPerDirection * 2; i++)
            {
                Vector2 offset = road.GetLaneOffset(i, true);
                Point laneStart = WorldToScreen(road.Start + offset, centerX, centerY);
                Point laneEnd = WorldToScreen(road.End + offset, centerX, centerY);
                context.DrawLine(lanePen, laneStart, laneEnd);
            }
        }

        foreach (var light in _simulator.TrafficLightManager.TrafficLights)
        {
            Point pos = WorldToScreen(light.Position, centerX, centerY);

            var boxRect = new Rect(pos.X - 25, pos.Y - 12, 50, 24);
            context.DrawRectangle(Brushes.Black, null, boxRect);

            double lightRadius = 7;
            double spacing = 16;

            DrawTrafficLight(context, new Point(pos.X - spacing, pos.Y), light.HorizontalState, lightRadius, true);
            DrawTrafficLight(context, new Point(pos.X + spacing, pos.Y), light.VerticalState, lightRadius, false);

            FormattedText hText = new FormattedText
            {
                Text = "H",
                TextAlignment = TextAlignment.Center
            };
            hText.Typeface = new Typeface("Arial");
            hText.FontSize = 10;
            context.DrawText(Brushes.White, new Point(pos.X - spacing - 4, pos.Y + 10), hText);

            FormattedText vText = new FormattedText
            {
                Text = "V",
                TextAlignment = TextAlignment.Center
            };
            vText.Typeface = new Typeface("Arial");
            vText.FontSize = 10;
            context.DrawText(Brushes.White, new Point(pos.X + spacing - 4, pos.Y + 10), vText);
        }

        foreach (var vehicle in _simulator.Vehicles)
        {
            Point pos = WorldToScreen(vehicle.Position, centerX, centerY);
            float rotation = vehicle.GetRotation();

            var color = new Avalonia.Media.Color(255, vehicle.Color.R, vehicle.Color.G, vehicle.Color.B);
            var brush = new SolidColorBrush(color);

            using (context.PushPostTransform(Matrix.CreateRotation(rotation * (float)Math.PI / 180f, pos.X, pos.Y)))
            {
                var rect = new Rect(pos.X - vehicle.Length / 2, pos.Y - vehicle.Width / 2, vehicle.Length, vehicle.Width);
                context.DrawRectangle(brush, null, rect);
                
                if (vehicle.Velocity.Length() < 5f)
                {
                    context.DrawEllipse(Brushes.OrangeRed, null, new Point(pos.X, pos.Y - vehicle.Width / 2 - 5), 4, 4);
                }
            }
        }
    }

    private Point WorldToScreen(Vector2 worldPos, float centerX, float centerY)
    {
        return new Point(worldPos.X + centerX, worldPos.Y + centerY);
    }

    private void DrawTrafficLight(DrawingContext context, Point position, LightState state, double radius, bool isHorizontal)
    {
        var offBrush = Brushes.DarkGray;
        var redBrush = Brushes.Red;
        var yellowBrush = Brushes.Yellow;
        var greenBrush = Brushes.LimeGreen;

        if (isHorizontal)
        {
            double offset = radius * 1.5;
            context.DrawEllipse(state == LightState.Red ? redBrush : offBrush, null, new Point(position.X - offset, position.Y), radius, radius);
            context.DrawEllipse(state == LightState.Yellow ? yellowBrush : offBrush, null, position, radius, radius);
            context.DrawEllipse(state == LightState.Green ? greenBrush : offBrush, null, new Point(position.X + offset, position.Y), radius, radius);
        }
        else
        {
            double offset = radius * 1.5;
            context.DrawEllipse(state == LightState.Red ? redBrush : offBrush, null, new Point(position.X, position.Y - offset), radius, radius);
            context.DrawEllipse(state == LightState.Yellow ? yellowBrush : offBrush, null, position, radius, radius);
            context.DrawEllipse(state == LightState.Green ? greenBrush : offBrush, null, new Point(position.X, position.Y + offset), radius, radius);
        }
    }
}
