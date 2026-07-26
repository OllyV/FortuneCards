namespace FortuneCards.Server.Services
{
    public sealed class R2Options
    {
        public string AccountId { get; set; } = "";
        public string AccessKey { get; set; } = "";
        public string SecretKey { get; set; } = "";
        public string Bucket { get; set; } = "";
        public string PublicBaseUrl { get; set; } = "";

        public string ServiceUrl => $"https://{AccountId}.r2.cloudflarestorage.com";
    }
}
