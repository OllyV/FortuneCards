using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using FortuneCards.Server.Data;
using FortuneCards.Server.Middleware;
using FortuneCards.Server.Services;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<FortuneCardsDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sql => sql.EnableRetryOnFailure(maxRetryCount: 5, maxRetryDelay: TimeSpan.FromSeconds(10), errorNumbersToAdd: null)));

builder.Services.AddMemoryCache();
builder.Services.AddApplicationInsightsTelemetry();
builder.Services.AddScoped<IDeckService, DeckService>();
builder.Services.AddScoped<ICardService, CardService>();
builder.Services.AddScoped<IAuthService, AuthService>();

var blobConnection = builder.Configuration["BlobStorage:ConnectionString"]
    ?? throw new InvalidOperationException("BlobStorage:ConnectionString is not configured.");
var blobContainerName = builder.Configuration["BlobStorage:Container"] ?? "images";

builder.Services.AddSingleton(_ =>
{
    var service = new BlobServiceClient(blobConnection);
    var container = service.GetBlobContainerClient(blobContainerName);
    container.CreateIfNotExists(PublicAccessType.Blob);
    return container;
});
builder.Services.AddSingleton<IImageStorage, BlobImageStorage>();

builder.Services.AddHttpClient("google");

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:5173", "https://127.0.0.1:51313")
              .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddOpenApi();

var app = builder.Build();

// Resolve the blob container eagerly so an invalid/unreachable storage account or a
// container that cannot be created with public access fails fast at startup, not on
// the first image request.
app.Services.GetRequiredService<Azure.Storage.Blobs.BlobContainerClient>();

if (app.Environment.IsDevelopment() || app.Configuration.GetValue<bool>("EnableApiDocs"))
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseDefaultFiles();
app.UseStaticFiles();      // serves wwwroot/images/ (runtime-uploaded card images)
app.MapStaticAssets();     // serves compiled Angular assets with optimized headers


app.UseHttpsRedirection();
app.UseCors();
app.UseMiddleware<JwtMiddleware>();
app.UseAuthorization();
app.MapControllers();
app.MapFallbackToFile("/index.html");

app.Run();
