using FortuneCards.Server.Models;
using FortuneCards.Server.Services;
using Microsoft.EntityFrameworkCore;

namespace FortuneCards.Server.Tests;

public class NotificationServiceTests
{
    private static TestDb Seeded(out int recipientId)
    {
        var h = new TestDb();
        h.AddUser(2, "Owner");
        h.AddUser(3, "Actor");
        h.AddDeck(5, userId: 2, isPublic: true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 3, body: "hello owner");
        recipientId = 2;
        return h;
    }

    [Fact]
    public async Task UnreadCount_counts_only_unread_for_user()
    {
        using var h = Seeded(out var recipient);
        h.AddUser(99, "Other");
        h.AddNotification(1, recipient, commentId: 1, NotificationType.CommentOnContent, actorId: 3, isRead: false);
        h.AddNotification(2, recipient, commentId: 1, NotificationType.CommentOnContent, actorId: 3, isRead: true);
        h.AddNotification(3, recipientId: 99, commentId: 1, NotificationType.CommentOnContent, actorId: 3, isRead: false);

        Assert.Equal(1, await h.NewNotificationService().UnreadCountAsync(recipient));
    }

    [Fact]
    public async Task List_returns_actor_and_route_and_snippet()
    {
        using var h = Seeded(out var recipient);
        h.AddNotification(1, recipient, commentId: 1, NotificationType.CommentOnContent, actorId: 3);

        var page = await h.NewNotificationService().ListAsync(recipient, 1, 20);

        var dto = page.Items.Single();
        Assert.Equal("Actor", dto.ActorName);
        Assert.Equal("/decks/5", dto.TargetRoute);
        Assert.Equal("hello owner", dto.CommentSnippet);
    }

    [Fact]
    public async Task MarkRead_all_clears_unread()
    {
        using var h = Seeded(out var recipient);
        h.AddNotification(1, recipient, 1, NotificationType.CommentOnContent, 3);
        h.AddNotification(2, recipient, 1, NotificationType.CommentOnContent, 3);

        var marked = await h.NewNotificationService().MarkReadAsync(recipient, ids: null);

        Assert.Equal(2, marked);
        Assert.Equal(0, await h.NewNotificationService().UnreadCountAsync(recipient));
    }

    [Fact]
    public async Task MarkRead_specific_ids_only()
    {
        using var h = Seeded(out var recipient);
        h.AddNotification(1, recipient, 1, NotificationType.CommentOnContent, 3);
        h.AddNotification(2, recipient, 1, NotificationType.CommentOnContent, 3);

        await h.NewNotificationService().MarkReadAsync(recipient, ids: new[] { 1 });

        Assert.Equal(1, await h.NewNotificationService().UnreadCountAsync(recipient));
    }
}
