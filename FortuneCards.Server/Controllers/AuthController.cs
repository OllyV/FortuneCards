using System.Text.Json;
using FortuneCards.Server.Services;
using Google.Apis.Auth;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FortuneCards.Server.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _auth;
        private readonly IConfiguration _config;
        private readonly HttpClient _httpClient;

        public AuthController(IAuthService auth, IConfiguration config, IHttpClientFactory httpClientFactory)
        {
            _auth = auth;
            _config = config;
            _httpClient = httpClientFactory.CreateClient();
        }

        [HttpGet("google/login")]
        public IActionResult GoogleLogin()
        {
            var clientId = _config["Google:ClientId"]!;
            var redirectUri = _config["Google:RedirectUri"]!;
            var url = "https://accounts.google.com/o/oauth2/v2/auth" +
                      $"?client_id={Uri.EscapeDataString(clientId)}" +
                      $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
                      "&response_type=code" +
                      "&scope=openid%20email%20profile" +
                      "&access_type=online";
            return Ok(new { url });
        }

        [HttpGet("google/callback")]
        public async Task<IActionResult> GoogleCallback([FromQuery] string? code, [FromQuery] string? error)
        {
            if (error != null || code == null)
                return Redirect("/?auth=error");

            string idToken;
            try
            {
                idToken = await ExchangeCodeForIdToken(code);
            }
            catch
            {
                return Redirect("/?auth=error");
            }

            GoogleJsonWebSignature.Payload payload;
            try
            {
                payload = await GoogleJsonWebSignature.ValidateAsync(idToken,
                    new GoogleJsonWebSignature.ValidationSettings
                    {
                        Audience = new[] { _config["Google:ClientId"]! }
                    });
            }
            catch
            {
                return Redirect("/?auth=error");
            }

            var user = await _auth.UpsertUserAsync(
                payload.Subject,
                payload.Email,
                payload.Name ?? payload.Email,
                payload.Picture);

            var jwt = _auth.GenerateJwt(user);
            Response.Cookies.Append("fortune_auth", jwt, new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.Strict,
                Expires = DateTimeOffset.UtcNow.AddDays(7)
            });

            return Redirect("/");
        }

        [HttpGet("me")]
        public async Task<IActionResult> Me([FromServices] Data.FortuneCardsDbContext db)
        {
            if (HttpContext.Items["UserId"] is not int userId)
                return Unauthorized();

            var user = await db.Users.FindAsync(userId);
            if (user is null) return Unauthorized();

            return Ok(new { id = user.Id, email = user.Email, displayName = user.DisplayName, avatarUrl = user.AvatarUrl });
        }

        [HttpPost("logout")]
        public IActionResult Logout()
        {
            Response.Cookies.Delete("fortune_auth", new CookieOptions
            {
                SameSite = SameSiteMode.Strict,
                Secure = true
            });
            return Ok();
        }

        [HttpDelete("account")]
        public async Task<IActionResult> DeleteAccount([FromServices] Data.FortuneCardsDbContext db)
        {
            if (HttpContext.Items["UserId"] is not int userId)
                return Unauthorized();

            // Transfer public decks to system user (id=1)
            var publicDecks = await db.Decks.Where(d => d.UserId == userId && d.IsPublic).ToListAsync();
            publicDecks.ForEach(d => d.UserId = 1);

            // Delete private decks (cascade deletes their cards)
            var privateDecks = db.Decks.Where(d => d.UserId == userId && !d.IsPublic);
            db.Decks.RemoveRange(privateDecks);

            var user = await db.Users.FindAsync(userId);
            if (user != null) db.Users.Remove(user);

            await db.SaveChangesAsync();
            Response.Cookies.Delete("fortune_auth", new CookieOptions
            {
                SameSite = SameSiteMode.Strict,
                Secure = true
            });
            return Ok();
        }

        private async Task<string> ExchangeCodeForIdToken(string code)
        {
            var response = await _httpClient.PostAsync("https://oauth2.googleapis.com/token",
                new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["code"] = code,
                    ["client_id"] = _config["Google:ClientId"]!,
                    ["client_secret"] = _config["Google:ClientSecret"]!,
                    ["redirect_uri"] = _config["Google:RedirectUri"]!,
                    ["grant_type"] = "authorization_code"
                }));
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync();
            var doc = JsonDocument.Parse(json);
            return doc.RootElement.GetProperty("id_token").GetString()!;
        }
    }
}
