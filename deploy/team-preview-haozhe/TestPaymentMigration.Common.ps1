# Historical test payments are suppressed on future callback replay. This policy
# does not assert that every historical payment credited a retained game state.
if (-not ('StrayKittyTestPaymentMigration' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

public static class StrayKittyTestPaymentMigration
{
    private sealed class Prepared
    {
        public byte[] GameBytes;
        public byte[] PaymentBytes;
        public JsonObject Original;
        public JsonObject Expected;
        public Dictionary<string, object> Metadata;
    }
    private static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    private static string Text(JsonNode node)
    {
        if (node is JsonValue value && value.TryGetValue<string>(out var text) && !String.IsNullOrEmpty(text)) return text;
        throw new InvalidDataException("A required snapshot identity or status is invalid.");
    }
    private static bool Flag(JsonNode node)
    {
        if (node is JsonValue value && value.TryGetValue<bool>(out var flag)) return flag;
        throw new InvalidDataException("Existing applied-payment flags must be booleans.");
    }
    private static JsonObject Parse(byte[] bytes)
    {
        try {
            // Reject duplicate property names rather than letting a parser
            // silently choose one record or one flag over another.
            var reader = new Utf8JsonReader(bytes);
            var objects = new Stack<HashSet<string>>();
            while (reader.Read()) {
                if (reader.TokenType == JsonTokenType.StartObject) objects.Push(new HashSet<string>(StringComparer.Ordinal));
                else if (reader.TokenType == JsonTokenType.EndObject) objects.Pop();
                else if (reader.TokenType == JsonTokenType.PropertyName && !objects.Peek().Add(reader.GetString()))
                    throw new InvalidDataException("Snapshot JSON contains duplicate properties.");
            }
            if (JsonNode.Parse(bytes) is JsonObject root) return root;
        } catch (InvalidDataException) { throw; }
          catch { throw new InvalidDataException("Snapshot JSON is invalid."); }
        throw new InvalidDataException("Snapshot root must be an object.");
    }
    private static void AssertOnlyAppliedPaymentsChanged(JsonObject original, JsonObject candidate)
    {
        var before = (JsonObject)original.DeepClone();
        var after = (JsonObject)candidate.DeepClone();
        if (!(before["players"] is JsonObject beforePlayers) || !(after["players"] is JsonObject afterPlayers))
            throw new InvalidDataException("Player maps are invalid.");
        foreach (var item in beforePlayers) {
            if (!(item.Value is JsonObject player)) throw new InvalidDataException("Player record is invalid.");
            player.Remove("appliedPayments");
        }
        foreach (var item in afterPlayers) {
            if (!(item.Value is JsonObject player)) throw new InvalidDataException("Player record is invalid.");
            player.Remove("appliedPayments");
        }
        if (!JsonNode.DeepEquals(before, after))
            throw new InvalidDataException("Transformation changed fields outside appliedPayments.");
    }
    private static Prepared Prepare(string gamePath, string paymentsPath)
    {
        var gameBytes = File.ReadAllBytes(gamePath);
        var paymentBytes = File.ReadAllBytes(paymentsPath);
        var original = Parse(gameBytes);
        var ledger = Parse(paymentBytes);
        if (!(original["schemaVersion"] is JsonValue version) || !version.TryGetValue<int>(out var schema) || schema != 1 ||
            !(original["players"] is JsonObject players) || !(ledger["players"] is JsonObject ledgerPlayers))
            throw new InvalidDataException("Unsupported game or payment snapshot structure.");
        var expected = (JsonObject)original.DeepClone();
        var expectedPlayers = (JsonObject)expected["players"];
        var byID = new Dictionary<string, JsonObject>(StringComparer.Ordinal);
        foreach (var item in expectedPlayers) {
            if (String.IsNullOrEmpty(item.Key) || !(item.Value is JsonObject player))
                throw new InvalidDataException("Player record is invalid.");
            var id = Text(player["id"]);
            if (!byID.TryAdd(id, player)) throw new InvalidDataException("Duplicate player identities in game snapshot.");
            if (player["appliedPayments"] != null) {
                if (!(player["appliedPayments"] is JsonObject flags)) throw new InvalidDataException("Applied-payment map is invalid.");
                foreach (var flag in flags) Flag(flag.Value);
            }
        }
        var seen = new Dictionary<string, JsonObject>(StringComparer.Ordinal);
        var changedPlayers = new HashSet<string>(StringComparer.Ordinal);
        int transactions = 0, confirmed = 0, alreadySuppressed = 0, newlySuppressed = 0;
        int nonConfirmedOrphanRecords = 0, declinedOrphanRecords = 0;
        foreach (var owner in ledgerPlayers) {
            var hasPlayer = byID.TryGetValue(owner.Key, out var player);
            if (!(owner.Value is JsonArray history)) throw new InvalidDataException("Payment history must be an array.");
            if (!hasPlayer && history.Count == 0) throw new InvalidDataException("An empty ledger owner has no corresponding game player.");
            foreach (var node in history) {
                if (!(node is JsonObject txn)) throw new InvalidDataException("Payment transaction is invalid.");
                var id = Text(txn["id"]);
                if (Text(txn["playerId"]) != owner.Key) throw new InvalidDataException("Payment transaction ownership does not match its ledger player.");
                var status = Text(txn["status"]);
                if (seen.TryGetValue(id, out var existing)) {
                    if (!JsonNode.DeepEquals(existing, txn)) throw new InvalidDataException("Conflicting duplicate transaction IDs in payment ledger.");
                    // The existing MySQL ledger importer rejects even identical
                    // duplicate IDs; never silently drop historical records.
                    throw new InvalidDataException("Duplicate transaction IDs cannot be imported without changing ledger history.");
                }
                seen.Add(id, txn);
                transactions++;
                // Declined/non-confirmed historical probes have no balance
                // effect. Preserve those ledger records without inventing a
                // player or a deduplication flag for their absent owner.
                if (!hasPlayer) {
                    if (status == "confirmed") throw new InvalidDataException("Confirmed payment references a missing game player.");
                    nonConfirmedOrphanRecords++;
                    if (status == "declined") declinedOrphanRecords++;
                    continue;
                }
                if (status != "confirmed") continue;
                confirmed++;
                var flags = player["appliedPayments"] as JsonObject;
                if (flags != null && flags.TryGetPropertyValue(id, out var current) && Flag(current)) {
                    alreadySuppressed++;
                    continue;
                }
                if (flags == null) { flags = new JsonObject(); player["appliedPayments"] = flags; }
                flags[id] = true;
                newlySuppressed++;
                changedPlayers.Add(owner.Key);
            }
        }
        AssertOnlyAppliedPaymentsChanged(original, expected);
        return new Prepared {
            GameBytes = gameBytes, PaymentBytes = paymentBytes, Original = original, Expected = expected,
            Metadata = new Dictionary<string, object> {
                ["version"] = 1, ["policy"] = "suppress-historical-confirmed-test-payment-callbacks",
                ["gameSourceSha256"] = Hash(gameBytes), ["paymentsSourceSha256"] = Hash(paymentBytes),
                ["players"] = players.Count, ["ledgerPlayers"] = ledgerPlayers.Count,
                ["ledgerTransactions"] = transactions, ["confirmedTransactions"] = confirmed,
                ["alreadySuppressed"] = alreadySuppressed, ["newlySuppressed"] = newlySuppressed,
                ["changedPlayers"] = changedPlayers.Count,
                ["nonConfirmedOrphanRecords"] = nonConfirmedOrphanRecords, ["declinedOrphanRecords"] = declinedOrphanRecords
            }
        };
    }
    private static void VerifyPrepared(Prepared prepared, byte[] candidate)
    {
        var imported = Parse(candidate);
        AssertOnlyAppliedPaymentsChanged(prepared.Original, imported);
        if (!JsonNode.DeepEquals(prepared.Expected, imported))
            throw new InvalidDataException("Applied-payment flags do not match the confirmed-test-payment policy.");
    }
    private static void AssertSourcesUnchanged(Prepared prepared, string gamePath, string paymentsPath)
    {
        if (Hash(File.ReadAllBytes(gamePath)) != Hash(prepared.GameBytes) || Hash(File.ReadAllBytes(paymentsPath)) != Hash(prepared.PaymentBytes))
            throw new InvalidDataException("An original snapshot changed during transformation.");
    }
    public static string Create(string gamePath, string paymentsPath, string outputPath)
    {
        gamePath = Path.GetFullPath(gamePath); paymentsPath = Path.GetFullPath(paymentsPath); outputPath = Path.GetFullPath(outputPath);
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        if (outputPath.Equals(gamePath, comparison) || outputPath.Equals(paymentsPath, comparison) || File.Exists(outputPath) || Directory.Exists(outputPath))
            throw new InvalidDataException("Output must be a new file distinct from both original snapshots.");
        var prepared = Prepare(gamePath, paymentsPath);
        var bytes = Encoding.UTF8.GetBytes(prepared.Expected.ToJsonString());
        VerifyPrepared(prepared, bytes);
        var temporary = outputPath + ".tmp-" + Guid.NewGuid().ToString("N");
        try {
            using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
                if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(temporary, UnixFileMode.UserRead | UnixFileMode.UserWrite);
                stream.Write(bytes); stream.Flush(true);
            }
            AssertSourcesUnchanged(prepared, gamePath, paymentsPath);
            File.Move(temporary, outputPath, false);
            if (OperatingSystem.IsWindows()) File.SetAttributes(outputPath, File.GetAttributes(outputPath) | FileAttributes.ReadOnly);
            else File.SetUnixFileMode(outputPath, UnixFileMode.UserRead);
            VerifyPrepared(prepared, File.ReadAllBytes(outputPath));
            AssertSourcesUnchanged(prepared, gamePath, paymentsPath);
            prepared.Metadata["gameImportSha256"] = Hash(File.ReadAllBytes(outputPath));
            return JsonSerializer.Serialize(prepared.Metadata);
        } finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    public static string Verify(string gamePath, string paymentsPath, string outputPath)
    {
        var prepared = Prepare(gamePath, paymentsPath);
        var bytes = File.ReadAllBytes(outputPath);
        VerifyPrepared(prepared, bytes);
        AssertSourcesUnchanged(prepared, gamePath, paymentsPath);
        prepared.Metadata["gameImportSha256"] = Hash(bytes);
        return JsonSerializer.Serialize(prepared.Metadata);
    }
}
'@
}

function New-LegacyTestPaymentImport {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$GamePath,
        [Parameter(Mandatory)][string]$PaymentsPath,
        [Parameter(Mandatory)][string]$OutputPath
    )
    $ErrorActionPreference = 'Stop'
    [StrayKittyTestPaymentMigration]::Create($GamePath, $PaymentsPath, $OutputPath) | ConvertFrom-Json -AsHashtable
}

function Test-LegacyTestPaymentImport {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$GamePath,
        [Parameter(Mandatory)][string]$PaymentsPath,
        [Parameter(Mandatory)][string]$OutputPath
    )
    $ErrorActionPreference = 'Stop'
    [StrayKittyTestPaymentMigration]::Verify($GamePath, $PaymentsPath, $OutputPath) | ConvertFrom-Json -AsHashtable
}
