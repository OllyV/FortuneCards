namespace FortuneCards.Server.Models
{
    public enum CommentTargetType { Deck = 0, Card = 1, Pattern = 2 }

    public class Comment
    {
        public int Id { get; set; }
        public CommentTargetType TargetType { get; set; }
        public int TargetId { get; set; }               // polymorphic — no DB FK
        public int? ParentCommentId { get; set; }        // null = top-level; else a top-level comment
        public Comment? ParentComment { get; set; }
        public ICollection<Comment> Replies { get; set; } = new List<Comment>();
        public int? UserId { get; set; }                 // author; SetNull on user delete
        public User? User { get; set; }
        public required string Body { get; set; }
        public bool IsDeleted { get; set; } = false;     // tombstone
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? EditedAt { get; set; }
    }
}
