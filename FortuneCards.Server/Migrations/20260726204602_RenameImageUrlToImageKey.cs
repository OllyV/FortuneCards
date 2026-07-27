using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FortuneCards.Server.Migrations
{
    /// <inheritdoc />
    public partial class RenameImageUrlToImageKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "ImageUrl",
                table: "Cards",
                newName: "ImageKey");

            migrationBuilder.RenameColumn(
                name: "CardBackImageUrl",
                table: "Decks",
                newName: "CardBackImageKey");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "ImageKey",
                table: "Cards",
                newName: "ImageUrl");

            migrationBuilder.RenameColumn(
                name: "CardBackImageKey",
                table: "Decks",
                newName: "CardBackImageUrl");
        }
    }
}
