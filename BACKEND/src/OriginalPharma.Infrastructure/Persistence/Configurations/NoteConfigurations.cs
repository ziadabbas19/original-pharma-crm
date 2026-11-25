using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OriginalPharma.Domain.Identity;
using OriginalPharma.Domain.Notes;

namespace OriginalPharma.Infrastructure.Persistence.Configurations;

internal sealed class RepNoteConfiguration : IEntityTypeConfiguration<RepNote>
{
    public void Configure(EntityTypeBuilder<RepNote> builder)
    {
        builder.ToTable("rep_notes", t =>
            t.HasCheckConstraint("ck_rep_notes_remind_before", $"remind_before_minutes IS NULL OR remind_before_minutes BETWEEN 0 AND {RepNote.MaxRemindBeforeMinutes}"));
        builder.Property(n => n.Title).HasMaxLength(RepNote.TitleMaxLength);
        builder.Property(n => n.Body).HasMaxLength(RepNote.BodyMaxLength).IsRequired();

        // A note sent twice from the phone's outbox is stored once.
        builder.HasIndex(n => new { n.UserId, n.ClientRequestId }).IsUnique();

        // Reminders still to fire: the only rows NoteRemindersJob looks at.
        builder.HasIndex(n => new { n.UserId, n.NotifyAt })
            .HasFilter("notified_at IS NULL AND done_at IS NULL")
            .HasDatabaseName("ix_rep_notes_pending_reminders");

        builder.HasOne<User>().WithMany().HasForeignKey(n => n.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
