using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using OriginalPharma.Application.Orders;
using OriginalPharma.Infrastructure.Persistence;

namespace OriginalPharma.Infrastructure.Orders;

/// <summary>Order numbers from the <c>order_numbers</c> PostgreSQL sequence (gaps are fine; duplicates are impossible).</summary>
internal sealed class OrderNumberGenerator(AppDbContext db) : IOrderNumberGenerator
{
    public const string SequenceName = "order_numbers";

    public async Task<long> NextAsync(CancellationToken cancellationToken = default)
    {
        var connection = db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync(cancellationToken);
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = $"SELECT nextval('{SequenceName}')";
            command.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
            return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
    }
}
