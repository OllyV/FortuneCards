namespace FortuneCards.Server.Models
{
    public class PatternCard
    {
        public int Id { get; set; }
        public required string Text { get; set; }
        public int Order { get; set; }
        public double X { get; set; }
        public double Y { get; set; }
        public double Rotation { get; set; }
        public int PatternId { get; set; }
        public Pattern Pattern { get; set; } = null!;
    }
}
