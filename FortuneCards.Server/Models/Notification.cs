namespace FortuneCards.Server.Models
{
    public enum NotificationType { Reply = 0, CommentOnContent = 1 }

    public class Notification
    {
        public int Id { get; set; }
        public int RecipientUserId { get; set; }         // Cascade on user delete
        public User? RecipientUser { get; set; }
        public NotificationType Type { get; set; }
        public int CommentId { get; set; }               // the reply or new top-level comment; Cascade
        public Comment? Comment { get; set; }
        public int? ActorUserId { get; set; }            // who acted; SetNull
        public User? ActorUser { get; set; }
        public bool IsRead { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
