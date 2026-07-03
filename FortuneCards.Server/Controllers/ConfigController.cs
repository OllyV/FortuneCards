using Microsoft.AspNetCore.Mvc;

namespace FortuneCards.Server.Controllers
{
    [ApiController]
    [Route("api/config")]
    public class ConfigController : ControllerBase
    {
        private readonly IConfiguration _config;

        public ConfigController(IConfiguration config) => _config = config;

        [HttpGet]
        public IActionResult GetConfig()
        {
            var connectionString =
                _config["ApplicationInsights:ConnectionString"]
                ?? _config["APPLICATIONINSIGHTS_CONNECTION_STRING"]
                ?? string.Empty;

            return Ok(new { applicationInsightsConnectionString = connectionString });
        }
    }
}
