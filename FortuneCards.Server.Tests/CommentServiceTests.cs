using FortuneCards.Server.Models;
using FortuneCards.Server.Services;
using Microsoft.EntityFrameworkCore;

namespace FortuneCards.Server.Tests;

public class CommentServiceTests
{
    [Fact]
    public async Task Create_top_level_comment_persists_and_returns_dto()
    {
        using var h = new TestDb();
        h.AddUser(2, "Commenter");
        h.AddDeck(5, userId: 1, isPublic: true);

        var dto = await h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, null, "  Nice deck  ", userId: 2);

        Assert.NotNull(dto);
        Assert.Equal("Nice deck", dto!.Body);       // trimmed
        Assert.Null(dto.ParentCommentId);
        Assert.True(dto.IsMine);
        Assert.Equal("Commenter", dto.AuthorName);
        Assert.Equal(1, await h.Db.Comments.CountAsync());
    }

    [Fact]
    public async Task Create_empty_body_is_rejected()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        await Assert.ThrowsAsync<ArgumentException>(
            () => h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, null, "   ", 2));
    }

    [Fact]
    public async Task Create_over_2000_chars_is_rejected()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        await Assert.ThrowsAsync<ArgumentException>(
            () => h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, null, new string('x', 2001), 2));
    }

    [Fact]
    public async Task Create_on_missing_target_returns_null()
    {
        using var h = new TestDb();
        h.AddUser(2);
        var dto = await h.NewCommentService().CreateAsync(CommentTargetType.Deck, 999, null, "hi", 2);
        Assert.Null(dto);
    }

    [Fact]
    public async Task Reply_to_a_reply_is_rejected()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        var top = h.AddComment(1, CommentTargetType.Deck, 5, userId: 2);
        var reply = h.AddComment(2, CommentTargetType.Deck, 5, userId: 2, parentId: top.Id);

        await Assert.ThrowsAsync<ArgumentException>(
            () => h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, reply.Id, "nested", 2));
    }

    [Fact]
    public async Task Reply_notifies_parent_author_not_self()
    {
        using var h = new TestDb();
        h.AddUser(2, "Alice");
        h.AddUser(3, "Bob");
        h.AddDeck(5, 1, true);
        var top = h.AddComment(1, CommentTargetType.Deck, 5, userId: 2); // Alice's comment

        await h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, top.Id, "Bob replies", userId: 3);

        var notif = await h.Db.Notifications.SingleAsync();
        Assert.Equal(2, notif.RecipientUserId);              // Alice notified
        Assert.Equal(3, notif.ActorUserId);                  // by Bob
        Assert.Equal(NotificationType.Reply, notif.Type);
    }

    [Fact]
    public async Task Reply_to_own_comment_creates_no_notification()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        var top = h.AddComment(1, CommentTargetType.Deck, 5, userId: 2);

        await h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, top.Id, "self reply", userId: 2);

        Assert.Equal(0, await h.Db.Notifications.CountAsync());
    }

    [Fact]
    public async Task Top_level_comment_notifies_deck_owner()
    {
        using var h = new TestDb();
        h.AddUser(2, "Owner");
        h.AddUser(3, "Visitor");
        h.AddDeck(5, userId: 2, isPublic: true);

        await h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, null, "hi owner", userId: 3);

        var notif = await h.Db.Notifications.SingleAsync();
        Assert.Equal(2, notif.RecipientUserId);
        Assert.Equal(NotificationType.CommentOnContent, notif.Type);
    }

    [Fact]
    public async Task Owner_commenting_on_own_deck_creates_no_notification()
    {
        using var h = new TestDb();
        h.AddUser(2, "Owner");
        h.AddDeck(5, userId: 2, isPublic: true);

        await h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, null, "my own note", userId: 2);

        Assert.Equal(0, await h.Db.Notifications.CountAsync());
    }

    [Fact]
    public async Task Top_level_comment_on_card_notifies_deck_owner()
    {
        using var h = new TestDb();
        h.AddUser(2, "Owner");
        h.AddUser(3, "Visitor");
        h.AddDeck(5, userId: 2, isPublic: true);
        h.AddCard(9, deckId: 5);

        await h.NewCommentService().CreateAsync(CommentTargetType.Card, 9, null, "nice card", userId: 3);

        var notif = await h.Db.Notifications.SingleAsync();
        Assert.Equal(2, notif.RecipientUserId);
    }
}
