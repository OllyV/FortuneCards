# FortuneCards

Available at: https://fortunecards-b2gmfjgkg4dteag4.westeurope-01.azurewebsites.net/decks

Asp.Net core + Angular + AzureDB SqlServer solution for creating fortune card decks.
Created together with Claude Code by principle "not a single line human-written".

Used claude plugins:
- superpowers
- frontend-design
  
The development to working solution took 3 days:
- Day 1: Base protoype creation with Claude + Cursor. Azure Sql Server setup.
- Day 2: UI redesign with Claude superpowers. ScreenShots before and after redesign can be found in UIScreenshots folder.
- Day 3: Set up hosting on Azure App Services with GitHub actions, UI bugfix with Claude + Cursor.
- Day 4: Add lazy loading to angular, add navigation bar component, add more deck colors, fix border of navigation bar.
- Day 5: Authorization with Google OAuth2 and user's decks visibility modes added.
- Day 6: Decks and cards edit pages added and patch controllers added.
- Day 7: Azure App Insights set.
- Day 8: Main menu created.

It can: create decks of cards with image and description. Randomly pull out one card.
