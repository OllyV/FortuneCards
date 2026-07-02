using Microsoft.AspNetCore.Http;

namespace FortuneCards.Server.Services
{
    public static class ImageStorage
    {
        public static async Task<string> SaveAsync(IWebHostEnvironment env, IFormFile file)
        {
            var imagesDir = Path.Combine(env.WebRootPath, "images");
            Directory.CreateDirectory(imagesDir);
            var ext = Path.GetExtension(file.FileName);
            var fileName = $"{Guid.NewGuid()}{ext}";
            using var stream = File.Create(Path.Combine(imagesDir, fileName));
            await file.CopyToAsync(stream);
            return $"/images/{fileName}";
        }

        public static void Delete(IWebHostEnvironment env, string imageUrl)
        {
            var fileName = Path.GetFileName(imageUrl);
            var path = Path.Combine(env.WebRootPath, "images", fileName);
            if (File.Exists(path)) File.Delete(path);
        }
    }
}
