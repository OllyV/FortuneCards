using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace FortuneCards.Server.Services
{
    public interface IImageStorage
    {
        Task<string> SaveAsync(IFormFile file);
        Task DeleteAsync(string imageUrl);
    }

    public class BlobImageStorage : IImageStorage
    {
        private readonly BlobContainerClient _container;

        public BlobImageStorage(BlobContainerClient container) => _container = container;

        public async Task<string> SaveAsync(IFormFile file)
        {
            var ext = Path.GetExtension(file.FileName);
            var blobName = $"{Guid.NewGuid()}{ext}";
            var blob = _container.GetBlobClient(blobName);
            await using var stream = file.OpenReadStream();
            await blob.UploadAsync(stream, new BlobUploadOptions
            {
                HttpHeaders = new BlobHttpHeaders { ContentType = file.ContentType }
            });
            return blob.Uri.ToString();
        }

        public async Task DeleteAsync(string imageUrl)
        {
            var blobName = GetBlobName(imageUrl);
            if (blobName is null) return;
            await _container.DeleteBlobIfExistsAsync(blobName);
        }

        // Last path segment of an absolute blob URL, or of a legacy "/images/{name}" path.
        public static string? GetBlobName(string imageUrl)
        {
            if (string.IsNullOrWhiteSpace(imageUrl)) return null;
            var name = Uri.TryCreate(imageUrl, UriKind.Absolute, out var uri)
                ? Path.GetFileName(uri.AbsolutePath)
                : Path.GetFileName(imageUrl);
            return string.IsNullOrWhiteSpace(name) ? null : name;
        }
    }
}
