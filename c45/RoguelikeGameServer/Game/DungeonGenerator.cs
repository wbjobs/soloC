using RoguelikeGameServer.Protocol;

namespace RoguelikeGameServer.Game;

public class DungeonGenerator
{
    private const int MapWidth = 50;
    private const int MapHeight = 50;
    private const int TileWall = 0;
    private const int TileFloor = 1;

    private readonly Random _random = new();

    public DungeonData GenerateDungeon(int playerCount)
    {
        var tiles = new int[MapWidth, MapHeight];
        for (int x = 0; x < MapWidth; x++)
            for (int y = 0; y < MapHeight; y++)
                tiles[x, y] = TileWall;

        var rooms = new List<RoomInstance>();
        int roomCount = 5 + playerCount * 2;

        for (int i = 0; i < roomCount; i++)
        {
            int roomWidth = _random.Next(4, 8);
            int roomHeight = _random.Next(4, 8);
            int roomX = _random.Next(1, MapWidth - roomWidth - 1);
            int roomY = _random.Next(1, MapHeight - roomHeight - 1);

            var newRoom = new RoomInstance
            {
                X = roomX,
                Y = roomY,
                Width = roomWidth,
                Height = roomHeight
            };

            bool overlaps = rooms.Any(r => RoomsOverlap(r, newRoom));
            if (overlaps) continue;

            CarveRoom(tiles, newRoom);

            if (rooms.Count > 0)
            {
                var prevRoom = rooms[rooms.Count - 1];
                CarveCorridor(tiles, prevRoom, newRoom);
            }

            rooms.Add(newRoom);
        }

        var monsters = GenerateMonsters(rooms);
        var items = GenerateItems(rooms);

        return new DungeonData
        {
            Width = MapWidth,
            Height = MapHeight,
            Tiles = tiles,
            Rooms = rooms.Select(r => new RoomInfo
            {
                RoomId = Guid.NewGuid().ToString("N"),
                X = r.X,
                Y = r.Y,
                Width = r.Width,
                Height = r.Height
            }).ToList(),
            Monsters = monsters,
            Items = items,
            StartPositions = rooms.Take(playerCount).Select(r =>
                (r.X + r.Width / 2, r.Y + r.Height / 2)
            ).ToList()
        };
    }

    private bool RoomsOverlap(RoomInstance a, RoomInstance b)
    {
        return a.X - 1 < b.X + b.Width &&
               a.X + a.Width + 1 > b.X &&
               a.Y - 1 < b.Y + b.Height &&
               a.Y + a.Height + 1 > b.Y;
    }

    private void CarveRoom(int[,] tiles, RoomInstance room)
    {
        for (int x = room.X; x < room.X + room.Width; x++)
            for (int y = room.Y; y < room.Y + room.Height; y++)
                tiles[x, y] = TileFloor;
    }

    private void CarveCorridor(int[,] tiles, RoomInstance a, RoomInstance b)
    {
        int ax = a.X + a.Width / 2;
        int ay = a.Y + a.Height / 2;
        int bx = b.X + b.Width / 2;
        int by = b.Y + b.Height / 2;

        int x = ax, y = ay;

        while (x != bx)
        {
            tiles[x, y] = TileFloor;
            if (y - 1 >= 0) tiles[x, y - 1] = TileFloor;
            if (y + 1 < MapHeight) tiles[x, y + 1] = TileFloor;
            x += x < bx ? 1 : -1;
        }

        while (y != by)
        {
            tiles[x, y] = TileFloor;
            if (x - 1 >= 0) tiles[x - 1, y] = TileFloor;
            if (x + 1 < MapWidth) tiles[x + 1, y] = TileFloor;
            y += y < by ? 1 : -1;
        }
    }

    private List<MonsterInfo> GenerateMonsters(List<RoomInstance> rooms)
    {
        var monsters = new List<MonsterInfo>();
        string[] monsterNames = { "哥布林", "骷髅", "史莱姆", "蝙蝠", "狼人" };

        foreach (var room in rooms.Skip(1))
        {
            int monsterCount = _random.Next(1, 3);
            for (int i = 0; i < monsterCount; i++)
            {
                int mx = _random.Next(room.X + 1, room.X + room.Width - 1);
                int my = _random.Next(room.Y + 1, room.Y + room.Height - 1);

                monsters.Add(new MonsterInfo
                {
                    MonsterId = Guid.NewGuid().ToString("N"),
                    Name = monsterNames[_random.Next(monsterNames.Length)],
                    PosX = mx,
                    PosY = my,
                    Hp = 30 + _random.Next(20),
                    MaxHp = 30 + _random.Next(20),
                    Attack = 5 + _random.Next(5),
                    Speed = 1
                });
            }
        }

        return monsters;
    }

    private List<ItemInfo> GenerateItems(List<RoomInstance> rooms)
    {
        var items = new List<ItemInfo>();
        var itemTypes = new[] { ItemType.HealthPotion, ItemType.AttackBoost, ItemType.Gold };

        foreach (var room in rooms)
        {
            if (_random.NextDouble() < 0.4)
            {
                int ix = _random.Next(room.X + 1, room.X + room.Width - 1);
                int iy = _random.Next(room.Y + 1, room.Y + room.Height - 1);

                items.Add(new ItemInfo
                {
                    ItemId = Guid.NewGuid().ToString("N"),
                    Type = itemTypes[_random.Next(itemTypes.Length)],
                    PosX = ix,
                    PosY = iy,
                    Value = _random.Next(10, 30)
                });
            }
        }

        return items;
    }
}

public class DungeonData
{
    public int Width { get; set; }
    public int Height { get; set; }
    public int[,]? Tiles { get; set; }
    public List<RoomInfo> Rooms { get; set; } = new();
    public List<MonsterInfo> Monsters { get; set; } = new();
    public List<ItemInfo> Items { get; set; } = new();
    public List<(int x, int y)> StartPositions { get; set; } = new();
}

public class RoomInstance
{
    public int X { get; set; }
    public int Y { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
}
