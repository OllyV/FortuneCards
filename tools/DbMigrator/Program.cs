using Microsoft.Data.SqlClient;
using Npgsql;
using NpgsqlTypes;

// One-off migration: Azure SQL -> Aiven PostgreSQL.
// Preserves primary-key IDs, forces UTC timestamps, resets identity sequences.
// Skips system user Id = 1 (already seeded by the EF InitialCreate migration).

var source = Environment.GetEnvironmentVariable("SOURCE_CONNECTION")
    ?? throw new InvalidOperationException("Set SOURCE_CONNECTION (Azure SQL) env var.");
var target = Environment.GetEnvironmentVariable("TARGET_CONNECTION")
    ?? throw new InvalidOperationException("Set TARGET_CONNECTION (Aiven Postgres) env var.");

static DateTime Utc(DateTime dt) => DateTime.SpecifyKind(dt, DateTimeKind.Utc);
static NpgsqlParameter P(string name, NpgsqlDbType type, object? value)
    => new(name, type) { Value = value ?? DBNull.Value };

await using var src = new SqlConnection(source);
await using var dst = new NpgsqlConnection(target);
await src.OpenAsync();
await dst.OpenAsync();

// ---- Users (skip system user Id = 1) ----
int users = 0;
await using (var read = new SqlCommand(
    "SELECT Id, GoogleId, Email, DisplayName, AvatarUrl, CreatedAt FROM Users WHERE Id <> 1", src))
await using (var r = await read.ExecuteReaderAsync())
{
    while (await r.ReadAsync())
    {
        await using var ins = new NpgsqlCommand(
            "INSERT INTO \"Users\" (\"Id\",\"GoogleId\",\"Email\",\"DisplayName\",\"AvatarUrl\",\"CreatedAt\") " +
            "VALUES (@id,@g,@e,@d,@a,@c)", dst);
        ins.Parameters.Add(P("id", NpgsqlDbType.Integer, r.GetInt32(0)));
        ins.Parameters.Add(P("g", NpgsqlDbType.Text, r.GetString(1)));
        ins.Parameters.Add(P("e", NpgsqlDbType.Text, r.GetString(2)));
        ins.Parameters.Add(P("d", NpgsqlDbType.Text, r.GetString(3)));
        ins.Parameters.Add(P("a", NpgsqlDbType.Text, r.IsDBNull(4) ? null : r.GetString(4)));
        ins.Parameters.Add(P("c", NpgsqlDbType.TimestampTz, Utc(r.GetDateTime(5))));
        await ins.ExecuteNonQueryAsync();
        users++;
    }
}
Console.WriteLine($"Users copied: {users}");

// ---- Decks ----
int decks = 0;
await using (var read = new SqlCommand(
    "SELECT Id, Name, Description, Emoji, ColorIndex, AspectWidth, AspectHeight, " +
    "CardBackImageUrl, CreatedAt, UserId, IsPublic FROM Decks", src))
await using (var r = await read.ExecuteReaderAsync())
{
    while (await r.ReadAsync())
    {
        await using var ins = new NpgsqlCommand(
            "INSERT INTO \"Decks\" (\"Id\",\"Name\",\"Description\",\"Emoji\",\"ColorIndex\"," +
            "\"AspectWidth\",\"AspectHeight\",\"CardBackImageUrl\",\"CreatedAt\",\"UserId\",\"IsPublic\") " +
            "VALUES (@id,@n,@desc,@em,@ci,@aw,@ah,@cb,@c,@uid,@pub)", dst);
        ins.Parameters.Add(P("id", NpgsqlDbType.Integer, r.GetInt32(0)));
        ins.Parameters.Add(P("n", NpgsqlDbType.Text, r.GetString(1)));
        ins.Parameters.Add(P("desc", NpgsqlDbType.Text, r.IsDBNull(2) ? null : r.GetString(2)));
        ins.Parameters.Add(P("em", NpgsqlDbType.Text, r.GetString(3)));
        ins.Parameters.Add(P("ci", NpgsqlDbType.Integer, r.GetInt32(4)));
        ins.Parameters.Add(P("aw", NpgsqlDbType.Integer, r.GetInt32(5)));
        ins.Parameters.Add(P("ah", NpgsqlDbType.Integer, r.GetInt32(6)));
        ins.Parameters.Add(P("cb", NpgsqlDbType.Text, r.IsDBNull(7) ? null : r.GetString(7)));
        ins.Parameters.Add(P("c", NpgsqlDbType.TimestampTz, Utc(r.GetDateTime(8))));
        ins.Parameters.Add(P("uid", NpgsqlDbType.Integer, r.IsDBNull(9) ? null : r.GetInt32(9)));
        ins.Parameters.Add(P("pub", NpgsqlDbType.Boolean, r.GetBoolean(10)));
        await ins.ExecuteNonQueryAsync();
        decks++;
    }
}
Console.WriteLine($"Decks copied: {decks}");

// ---- Cards ----
int cards = 0;
await using (var read = new SqlCommand(
    "SELECT Id, Title, Description, ImageUrl, CreatedAt, DeckId FROM Cards", src))
await using (var r = await read.ExecuteReaderAsync())
{
    while (await r.ReadAsync())
    {
        await using var ins = new NpgsqlCommand(
            "INSERT INTO \"Cards\" (\"Id\",\"Title\",\"Description\",\"ImageUrl\",\"CreatedAt\",\"DeckId\") " +
            "VALUES (@id,@t,@desc,@img,@c,@did)", dst);
        ins.Parameters.Add(P("id", NpgsqlDbType.Integer, r.GetInt32(0)));
        ins.Parameters.Add(P("t", NpgsqlDbType.Text, r.GetString(1)));
        ins.Parameters.Add(P("desc", NpgsqlDbType.Text, r.GetString(2)));
        ins.Parameters.Add(P("img", NpgsqlDbType.Text, r.GetString(3)));
        ins.Parameters.Add(P("c", NpgsqlDbType.TimestampTz, Utc(r.GetDateTime(4))));
        ins.Parameters.Add(P("did", NpgsqlDbType.Integer, r.GetInt32(5)));
        await ins.ExecuteNonQueryAsync();
        cards++;
    }
}
Console.WriteLine($"Cards copied: {cards}");

// ---- FavoriteDecks (composite key, no identity) ----
int favs = 0;
await using (var read = new SqlCommand(
    "SELECT UserId, DeckId, CreatedAt FROM FavoriteDecks", src))
await using (var r = await read.ExecuteReaderAsync())
{
    while (await r.ReadAsync())
    {
        await using var ins = new NpgsqlCommand(
            "INSERT INTO \"FavoriteDecks\" (\"UserId\",\"DeckId\",\"CreatedAt\") VALUES (@u,@d,@c)", dst);
        ins.Parameters.Add(P("u", NpgsqlDbType.Integer, r.GetInt32(0)));
        ins.Parameters.Add(P("d", NpgsqlDbType.Integer, r.GetInt32(1)));
        ins.Parameters.Add(P("c", NpgsqlDbType.TimestampTz, Utc(r.GetDateTime(2))));
        await ins.ExecuteNonQueryAsync();
        favs++;
    }
}
Console.WriteLine($"FavoriteDecks copied: {favs}");

// ---- Reset identity sequences so future inserts don't collide with copied IDs ----
await using (var reset = new NpgsqlCommand(
    "SELECT setval(pg_get_serial_sequence('\"Users\"','Id'), COALESCE((SELECT MAX(\"Id\") FROM \"Users\"), 1), (SELECT COUNT(*) FROM \"Users\") > 0);" +
    "SELECT setval(pg_get_serial_sequence('\"Decks\"','Id'), COALESCE((SELECT MAX(\"Id\") FROM \"Decks\"), 1), (SELECT COUNT(*) FROM \"Decks\") > 0);" +
    "SELECT setval(pg_get_serial_sequence('\"Cards\"','Id'), COALESCE((SELECT MAX(\"Id\") FROM \"Cards\"), 1), (SELECT COUNT(*) FROM \"Cards\") > 0);", dst))
{
    await reset.ExecuteNonQueryAsync();
}
Console.WriteLine("Identity sequences reset. Migration complete.");
