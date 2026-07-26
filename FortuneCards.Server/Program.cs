using FortuneCards.Server.Data;
using FortuneCards.Server.Middleware;
using FortuneCards.Server.Services;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<FortuneCardsDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        npgsql => npgsql.EnableRetryOnFailure(maxRetryCount: 5, maxRetryDelay: TimeSpan.FromSeconds(10), errorCodesToAdd: null)));

builder.Services.AddMemoryCache();
builder.Services.AddApplicationInsightsTelemetry();
builder.Services.AddScoped<IDeckService, DeckService>();
builder.Services.AddScoped<ICardService, CardService>();
builder.Services.AddScoped<IAuthService, AuthService>();

var r2 = builder.Configuration.GetSection("R2").Get<R2Options>()
    ?? throw new InvalidOperationException("R2 configuration section is missing.");
if (string.IsNullOrWhiteSpace(r2.AccountId) || string.IsNullOrWhiteSpace(r2.AccessKey)
    || string.IsNullOrWhiteSpace(r2.SecretKey) || string.IsNullOrWhiteSpace(r2.Bucket)
    || string.IsNullOrWhiteSpace(r2.PublicBaseUrl))
    throw new InvalidOperationException(
        "R2 configuration is incomplete (need AccountId, AccessKey, SecretKey, Bucket, PublicBaseUrl).");

builder.Services.AddSingleton(r2);
builder.Services.AddSingleton<Amazon.S3.IAmazonS3>(_ =>
    new Amazon.S3.AmazonS3Client(r2.AccessKey, r2.SecretKey, new Amazon.S3.AmazonS3Config
    {
        ServiceURL = r2.ServiceUrl,
        ForcePathStyle = true,
        AuthenticationRegion = "auto"
    }));
builder.Services.AddSingleton<IImageStorage, R2ImageStorage>();

builder.Services.AddHttpClient("google");

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:5173", "https://127.0.0.1:51313")
              .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment() || app.Configuration.GetValue<bool>("EnableApiDocs"))
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseDefaultFiles();
app.MapStaticAssets();     // serves compiled Angular assets with optimized headers


app.UseHttpsRedirection();
app.UseCors();
app.UseMiddleware<JwtMiddleware>();
app.UseAuthorization();
app.MapControllers();
app.MapFallbackToFile("/index.html");

app.Run();
