namespace FortuneCards.Server.Middleware
{
    public class JwtMiddleware
    {
        private readonly RequestDelegate _next;

        public JwtMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task Invoke(HttpContext context, Services.IAuthService authService)
        {
            if (context.Request.Cookies.TryGetValue("fortune_auth", out var token))
            {
                var userId = authService.ValidateJwt(token);
                if (userId.HasValue)
                    context.Items["UserId"] = userId.Value;
            }
            await _next(context);
        }
    }
}
