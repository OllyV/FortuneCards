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
    public async Task Reply_to_a_reply_is_nested()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        var top = h.AddComment(1, CommentTargetType.Deck, 5, userId: 2);
        var reply = h.AddComment(2, CommentTargetType.Deck, 5, userId: 2, parentId: top.Id);

        var dto = await h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, reply.Id, "nested", 2);

        Assert.NotNull(dto);
        Assert.Equal(reply.Id, dto!.ParentCommentId);   // stored under the reply — within the cap
    }

    [Fact]
    public async Task Reply_at_max_depth_clamps_to_sibling()
    {
        using var h = new TestDb();
        h.AddUser(2, "Owner");
        h.AddUser(3, "Replier");
        h.AddDeck(5, 1, true);
        // chain to depth 3: top(0) -> d1(1) -> d2(2) -> d3(3)
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2);
        h.AddComment(2, CommentTargetType.Deck, 5, userId: 2, parentId: 1);
        h.AddComment(3, CommentTargetType.Deck, 5, userId: 2, parentId: 2);
        var d3 = h.AddComment(4, CommentTargetType.Deck, 5, userId: 2, parentId: 3); // depth 3

        var dto = await h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, d3.Id, "too deep", userId: 3);

        Assert.NotNull(dto);
        Assert.Equal(3, dto!.ParentCommentId);           // clamped to d3's parent (the depth-2 comment)
        var notif = await h.Db.Notifications.SingleAsync();
        Assert.Equal(2, notif.RecipientUserId);          // still notifies the author of the comment replied to (d3)
        Assert.Equal(NotificationType.Reply, notif.Type);
    }

    [Fact]
    public async Task List_builds_multi_level_tree()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "top");
        h.AddComment(2, CommentTargetType.Deck, 5, userId: 2, parentId: 1, body: "r1");
        h.AddComment(3, CommentTargetType.Deck, 5, userId: 2, parentId: 2, body: "r2");

        var page = await h.NewCommentService().ListAsync(CommentTargetType.Deck, 5, 2, 1, 20);

        var top = page.Items.Single();
        Assert.Equal("top", top.Body);
        Assert.Equal(2, top.ReplyCount);                 // total descendants, not just direct children
        var r1 = top.Replies.Single();
        Assert.Equal("r1", r1.Body);
        Assert.Equal("r2", r1.Replies.Single().Body);    // nested two levels deep
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

    [Fact]
    public async Task List_returns_top_level_newest_first_with_replies_oldest_first()
    {
        using var h = new TestDb();
        h.AddUser(2, "A");
        h.AddDeck(5, 1, true);
        var first = h.AddComment(1, CommentTargetType.Deck, 5, 2, body: "first");
        var second = h.AddComment(2, CommentTargetType.Deck, 5, 2, body: "second");
        h.AddComment(3, CommentTargetType.Deck, 5, 2, parentId: first.Id, body: "reply-a");
        h.AddComment(4, CommentTargetType.Deck, 5, 2, parentId: first.Id, body: "reply-b");

        var page = await h.NewCommentService().ListAsync(CommentTargetType.Deck, 5, currentUserId: 2, page: 1, pageSize: 20);

        Assert.Equal(2, page.TotalCount);                       // top-level only
        Assert.Equal("second", page.Items.First().Body);        // newest first
        var firstDto = page.Items.Last();
        Assert.Equal(2, firstDto.ReplyCount);
        Assert.Equal(new[] { "reply-a", "reply-b" }, firstDto.Replies.Select(r => r.Body)); // oldest first
    }

    [Fact]
    public async Task List_shows_deleted_body_as_null_but_keeps_replies()
    {
        using var h = new TestDb();
        h.AddUser(2, "A");
        h.AddDeck(5, 1, true);
        var top = h.AddComment(1, CommentTargetType.Deck, 5, 2, body: "gone", isDeleted: true);
        h.AddComment(2, CommentTargetType.Deck, 5, 2, parentId: top.Id, body: "still here");

        var page = await h.NewCommentService().ListAsync(CommentTargetType.Deck, 5, 2, 1, 20);

        var dto = page.Items.Single();
        Assert.True(dto.IsDeleted);
        Assert.Null(dto.Body);
        Assert.Equal("still here", dto.Replies.Single().Body);
    }

    [Fact]
    public async Task ListMine_returns_only_my_comments_with_target_route()
    {
        using var h = new TestDb();
        h.AddUser(2, "Me");
        h.AddUser(3, "Other");
        h.AddDeck(5, 1, true);
        h.AddCard(9, deckId: 5, title: "The Card");
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "mine on deck");
        h.AddComment(2, CommentTargetType.Card, 9, userId: 2, body: "mine on card");
        h.AddComment(3, CommentTargetType.Deck, 5, userId: 3, body: "not mine");

        var page = await h.NewCommentService().ListMineAsync(userId: 2, page: 1, pageSize: 20);

        Assert.Equal(2, page.TotalCount);
        var cardComment = page.Items.Single(i => i.TargetType == CommentTargetType.Card);
        Assert.Equal("/decks/5/cards/9", cardComment.TargetRoute);
        Assert.Equal("The Card", cardComment.TargetLabel);
        var deckComment = page.Items.Single(i => i.TargetType == CommentTargetType.Deck);
        Assert.Equal("/decks/5", deckComment.TargetRoute);
    }

    [Fact]
    public async Task Update_by_author_sets_body_and_editedAt()
    {
        using var h = new TestDb();
        h.AddUser(2, "A");
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "old");

        var dto = await h.NewCommentService().UpdateAsync(1, "  new text  ", userId: 2);

        Assert.NotNull(dto);
        Assert.Equal("new text", dto!.Body);
        Assert.NotNull(dto.EditedAt);
    }

    [Fact]
    public async Task Update_by_non_author_returns_null()
    {
        using var h = new TestDb();
        h.AddUser(2); h.AddUser(3);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "old");

        var dto = await h.NewCommentService().UpdateAsync(1, "hax", userId: 3);

        Assert.Null(dto);
        Assert.Equal("old", await h.Db.Comments.Where(c => c.Id == 1).Select(c => c.Body).SingleAsync());
    }

    [Fact]
    public async Task Update_empty_body_is_rejected()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2);
        await Assert.ThrowsAsync<ArgumentException>(() => h.NewCommentService().UpdateAsync(1, "  ", 2));
    }

    [Fact]
    public async Task Delete_by_author_tombstones_and_keeps_replies()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "secret");
        h.AddComment(2, CommentTargetType.Deck, 5, userId: 2, parentId: 1, body: "reply");

        var ok = await h.NewCommentService().DeleteAsync(1, userId: 2);

        Assert.True(ok);
        var top = await h.Db.Comments.SingleAsync(c => c.Id == 1);
        Assert.True(top.IsDeleted);
        Assert.Equal(2, await h.Db.Comments.CountAsync());   // reply still present
    }

    [Fact]
    public async Task Delete_by_non_author_returns_false()
    {
        using var h = new TestDb();
        h.AddUser(2); h.AddUser(3);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2);

        var ok = await h.NewCommentService().DeleteAsync(1, userId: 3);

        Assert.False(ok);
        Assert.False(await h.Db.Comments.Where(c => c.Id == 1).Select(c => c.IsDeleted).SingleAsync());
    }

    [Fact]
    public async Task Deleting_deck_removes_its_and_its_cards_comments_and_notifications()
    {
        using var h = new TestDb();
        h.AddUser(2, "Owner");
        h.AddUser(3, "Visitor");
        h.AddDeck(5, userId: 2, isPublic: true);
        h.AddCard(9, deckId: 5);
        // A comment on the deck (by visitor → notifies owner) and one on the card.
        await h.NewCommentService().CreateAsync(CommentTargetType.Deck, 5, null, "on deck", userId: 3);
        await h.NewCommentService().CreateAsync(CommentTargetType.Card, 9, null, "on card", userId: 3);
        Assert.Equal(2, await h.Db.Comments.CountAsync());
        Assert.Equal(2, await h.Db.Notifications.CountAsync());

        var ok = await h.NewDeckService().DeleteAsync(5, userId: 2);

        Assert.True(ok);
        Assert.Equal(0, await h.Db.Comments.CountAsync());
        Assert.Equal(0, await h.Db.Notifications.CountAsync());
    }

    [Fact]
    public async Task Deleting_pattern_removes_its_comments()
    {
        using var h = new TestDb();
        h.AddUser(2, "Owner");
        h.AddUser(3, "Visitor");
        h.AddPattern(7, userId: 2, isPublic: true);
        await h.NewCommentService().CreateAsync(CommentTargetType.Pattern, 7, null, "nice spread", userId: 3);
        Assert.Equal(1, await h.Db.Comments.CountAsync());

        var ok = await h.NewPatternService().DeleteAsync(7, userId: 2);

        Assert.True(ok);
        Assert.Equal(0, await h.Db.Comments.CountAsync());
        Assert.Equal(0, await h.Db.Notifications.CountAsync());
    }

    [Fact]
    public async Task Delete_keeps_the_body_for_recovery()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "secret");

        await h.NewCommentService().DeleteAsync(1, userId: 2);

        var c = await h.Db.Comments.SingleAsync(x => x.Id == 1);
        Assert.True(c.IsDeleted);
        Assert.Equal("secret", c.Body);   // body retained, no longer scrubbed
    }

    [Fact]
    public async Task ListMine_returns_deleted_body_to_author()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "secret", isDeleted: true);

        var page = await h.NewCommentService().ListMineAsync(2, 1, 20);

        var item = page.Items.Single();
        Assert.True(item.IsDeleted);
        Assert.Equal("secret", item.Body);   // author sees their own deleted text
    }

    [Fact]
    public async Task Public_list_still_hides_deleted_body()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "secret", isDeleted: true);

        var page = await h.NewCommentService().ListAsync(CommentTargetType.Deck, 5, currentUserId: null, 1, 20);

        Assert.Null(page.Items.Single().Body);   // public threads still show [deleted]
    }

    [Fact]
    public async Task Restore_by_author_undeletes()
    {
        using var h = new TestDb();
        h.AddUser(2);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "secret", isDeleted: true);

        var ok = await h.NewCommentService().RestoreAsync(1, userId: 2);

        Assert.True(ok);
        Assert.False(await h.Db.Comments.Where(c => c.Id == 1).Select(c => c.IsDeleted).SingleAsync());
    }

    [Fact]
    public async Task Restore_by_non_author_returns_false_and_leaves_it_deleted()
    {
        using var h = new TestDb();
        h.AddUser(2); h.AddUser(3);
        h.AddDeck(5, 1, true);
        h.AddComment(1, CommentTargetType.Deck, 5, userId: 2, body: "secret", isDeleted: true);

        var ok = await h.NewCommentService().RestoreAsync(1, userId: 3);

        Assert.False(ok);
        Assert.True(await h.Db.Comments.Where(c => c.Id == 1).Select(c => c.IsDeleted).SingleAsync());
    }
}
