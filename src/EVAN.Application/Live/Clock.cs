namespace EVAN.Application.Live;

/// <summary>Horodatages en ms epoch, l'unité du front.</summary>
public static class Clock
{
    public static long Ms(DateTimeOffset t) => t.ToUnixTimeMilliseconds();
    public static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
