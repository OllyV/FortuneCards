using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using FortuneCards.Server.Data;
using FortuneCards.Server.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace FortuneCards.Server.Services
{
    public class AuthService : IAuthService
    {
        private readonly FortuneCardsDbContext _db;
        private readonly string _jwtSecret;
        private readonly IImageStorage _imageStorage;

        public const int MaxNicknameLength = 50;

        public AuthService(FortuneCardsDbContext db, IConfiguration configuration, IImageStorage imageStorage)
        {
            _db = db;
            _imageStorage = imageStorage;
            _jwtSecret = configuration["Jwt:Secret"]
                ?? throw new InvalidOperationException("Jwt:Secret is not configured.");
        }

        public string GenerateJwt(User user)
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSecret));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
            var claims = new[]
            {
                new Claim("userId", user.Id.ToString()),
                new Claim("email", user.Email),
                new Claim("displayName", user.DisplayName)
            };
            var token = new JwtSecurityToken(
                claims: claims,
                expires: DateTime.UtcNow.AddDays(7),
                signingCredentials: creds);
            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        public int? ValidateJwt(string token)
        {
            try
            {
                var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSecret));
                var handler = new JwtSecurityTokenHandler();
                handler.ValidateToken(token, new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = key,
                    ValidateIssuer = false,
                    ValidateAudience = false,
                    ClockSkew = TimeSpan.Zero
                }, out var validatedToken);
                var jwt = (JwtSecurityToken)validatedToken;
                return int.Parse(jwt.Claims.First(c => c.Type == "userId").Value);
            }
            catch
            {
                return null;
            }
        }

        public async Task<User> UpsertUserAsync(string googleId, string email, string displayName, string? avatarUrl)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.GoogleId == googleId);
            if (user is null)
            {
                user = new User
                {
                    GoogleId = googleId,
                    Email = email,
                    DisplayName = displayName,
                    AvatarUrl = avatarUrl
                };
                _db.Users.Add(user);
            }
            else
            {
                user.Email = email;
                user.DisplayName = displayName;
                user.AvatarUrl = avatarUrl;
            }
            await _db.SaveChangesAsync();
            return user;
        }

        public async Task<User?> UpdateProfileAsync(int userId, string? nickname, IFormFile? photo)
        {
            var trimmed = nickname?.Trim();
            if (trimmed is { Length: > MaxNicknameLength })
                throw new ArgumentException(
                    $"Nickname must be {MaxNicknameLength} characters or fewer.", nameof(nickname));

            var user = await _db.Users.FindAsync(userId);
            if (user is null) return null;

            user.Nickname = string.IsNullOrEmpty(trimmed) ? null : trimmed;

            if (photo is { Length: > 0 })
            {
                if (!string.IsNullOrEmpty(user.AvatarImageKey))
                    await _imageStorage.DeleteAsync(user.AvatarImageKey);
                user.AvatarImageKey = await _imageStorage.SaveAsync(photo);
            }

            await _db.SaveChangesAsync();
            return user;
        }
    }
}
