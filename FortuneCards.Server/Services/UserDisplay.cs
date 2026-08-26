using FortuneCards.Server.Models;

namespace FortuneCards.Server.Services
{
    /// <summary>Effective (nickname/custom-photo aware) display values for a user.</summary>
    internal static class UserDisplay
    {
        public static string Name(User? u) =>
            u is null ? "Unknown" : (string.IsNullOrWhiteSpace(u.Nickname) ? u.DisplayName : u.Nickname);

        public static string? AvatarUrl(User? u, IImageStorage storage) =>
            u is null ? null : (storage.PublicUrl(u.AvatarImageKey) ?? u.AvatarUrl);
    }
}
