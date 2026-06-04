using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FortuneCards.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddDeckVisualFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CardBackImageUrl",
                table: "Decks",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ColorIndex",
                table: "Decks",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Emoji",
                table: "Decks",
                type: "nvarchar(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "🎴");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CardBackImageUrl",
                table: "Decks");

            migrationBuilder.DropColumn(
                name: "ColorIndex",
                table: "Decks");

            migrationBuilder.DropColumn(
                name: "Emoji",
                table: "Decks");
        }
    }
}
