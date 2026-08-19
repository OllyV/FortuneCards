using FortuneCards.Server.Models;
using Microsoft.AspNetCore.Http;

namespace FortuneCards.Server.Services
{
    public interface IAuthService
    {
        string GenerateJwt(User user);
        int? ValidateJwt(string token);
        Task<User> UpsertUserAsync(string googleId, string email, string displayName, string? avatarUrl);
        Task<User?> UpdateProfileAsync(int userId, string? nickname, IFormFile? photo);
    }
}
