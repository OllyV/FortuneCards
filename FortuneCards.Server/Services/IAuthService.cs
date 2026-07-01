using FortuneCards.Server.Models;

namespace FortuneCards.Server.Services
{
    public interface IAuthService
    {
        string GenerateJwt(User user);
        int? ValidateJwt(string token);
        Task<User> UpsertUserAsync(string googleId, string email, string displayName, string? avatarUrl);
    }
}
