using RoguelikeGameServer.Network;

Console.WriteLine("========================================");
Console.WriteLine("  Roguelike Dungeon Game Server");
Console.WriteLine("========================================");

var server = new TcpServer(8888);

Console.CancelKeyPress += (sender, e) =>
{
    Console.WriteLine("\n正在关闭服务器...");
    server.Stop();
    e.Cancel = true;
};

try
{
    await server.StartAsync();
}
catch (Exception ex)
{
    Console.WriteLine($"服务器异常: {ex.Message}");
}

Console.WriteLine("服务器已停止");
