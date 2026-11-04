using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace Touchline;

public sealed class Store
{
    private readonly string connectionString;
    public Store(IConfiguration config)
    {
        var path = Path.GetFullPath(config["DatabasePath"] ?? "data/touchline.db");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        connectionString = new SqliteConnectionStringBuilder { DataSource = path }.ToString();
        using var db = Open();
        using var cmd = db.CreateCommand();
        cmd.CommandText = "CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS clips (source TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS discovered_goals (source TEXT PRIMARY KEY, published INTEGER NOT NULL, value TEXT NOT NULL); CREATE INDEX IF NOT EXISTS discovered_goals_published ON discovered_goals(published);";
        cmd.ExecuteNonQuery();
    }
    private SqliteConnection Open() { var db = new SqliteConnection(connectionString); db.Open(); return db; }
    public Preferences Preferences()
    {
        using var db = Open(); using var cmd = db.CreateCommand();
        cmd.CommandText = "SELECT value FROM state WHERE key = 'preferences'";
        return cmd.ExecuteScalar() is string value ? JsonSerializer.Deserialize<Preferences>(value, JsonDefaults.Options)! : Touchline.Preferences.Empty;
    }
    public void Save(Preferences value)
    {
        using var db = Open(); using var cmd = db.CreateCommand();
        cmd.CommandText = "INSERT INTO state VALUES ('preferences', $value) ON CONFLICT(key) DO UPDATE SET value=excluded.value";
        cmd.Parameters.AddWithValue("$value", JsonSerializer.Serialize(value, JsonDefaults.Options)); cmd.ExecuteNonQuery();
    }
    public Goal[] Clips()
    {
        using var db = Open(); using var cmd = db.CreateCommand(); cmd.CommandText = "SELECT value FROM clips ORDER BY rowid DESC LIMIT 500";
        using var reader = cmd.ExecuteReader(); var clips = new List<Goal>();
        while (reader.Read()) clips.Add(JsonSerializer.Deserialize<Goal>(reader.GetString(0), JsonDefaults.Options)!);
        return clips.ToArray();
    }
    public void KeepDiscovered(IEnumerable<Goal> goals, DateTimeOffset now)
    {
        using var db = Open(); using var transaction = db.BeginTransaction();
        foreach (var goal in goals.Where(goal => GoalWindow.Contains(goal, now)))
        {
            using var cmd = db.CreateCommand(); cmd.Transaction = transaction;
            cmd.CommandText = "INSERT INTO discovered_goals VALUES ($source,$published,$value) ON CONFLICT(source) DO UPDATE SET value=excluded.value";
            cmd.Parameters.AddWithValue("$source", goal.SourceUrl);
            cmd.Parameters.AddWithValue("$published", goal.PublishedAt.ToUnixTimeMilliseconds());
            cmd.Parameters.AddWithValue("$value", JsonSerializer.Serialize(goal, JsonDefaults.Options));
            cmd.ExecuteNonQuery();
        }
        transaction.Commit();
    }
    public Goal[] Discovered(DateTimeOffset now)
    {
        using var db = Open();
        using (var prune = db.CreateCommand())
        {
            prune.CommandText = "DELETE FROM discovered_goals WHERE published <= $cutoff";
            prune.Parameters.AddWithValue("$cutoff", now.AddHours(-48).ToUnixTimeMilliseconds());
            prune.ExecuteNonQuery();
        }
        using var cmd = db.CreateCommand();
        cmd.CommandText = "SELECT value FROM discovered_goals WHERE published <= $future ORDER BY published DESC";
        cmd.Parameters.AddWithValue("$future", now.AddMinutes(5).ToUnixTimeMilliseconds());
        using var reader = cmd.ExecuteReader(); var goals = new List<Goal>();
        while (reader.Read()) goals.Add(JsonSerializer.Deserialize<Goal>(reader.GetString(0), JsonDefaults.Options)!);
        return goals.ToArray();
    }
    public void Add(Goal goal)
    {
        using var db = Open(); using var cmd = db.CreateCommand();
        cmd.CommandText = "INSERT INTO clips VALUES ($source,$value) ON CONFLICT(source) DO UPDATE SET value=excluded.value";
        cmd.Parameters.AddWithValue("$source", goal.SourceUrl); cmd.Parameters.AddWithValue("$value", JsonSerializer.Serialize(goal, JsonDefaults.Options)); cmd.ExecuteNonQuery();
    }
    public void Remove(string id)
    {
        using var db = Open(); using var cmd = db.CreateCommand();
        cmd.CommandText = "DELETE FROM clips WHERE json_extract(value, '$.id') = $id"; cmd.Parameters.AddWithValue("$id", id); cmd.ExecuteNonQuery();
    }
}
