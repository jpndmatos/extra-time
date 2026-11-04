using Touchline;

namespace Touchline.Tests;

public class CrestTests
{
    [Theory]
    [InlineData("Swansea", "Swansea City AFC")]
    [InlineData("Portsmouth", "Portsmouth FC")]
    [InlineData("LASK", "LASK Linz")]
    [InlineData("Slovan Bratislava", "ŠK Slovan Bratislava")]
    [InlineData("Preston", "Preston North End FC")]
    [InlineData("Sheffield Utd", "Sheffield United FC")]
    [InlineData("West Brom", "West Bromwich Albion FC")]
    public void SharesOfficialCrestsAcrossFeedAndFixtureNames(string postName, string fixtureName)
    {
        var original = Catalog.FromName(postName);
        var provider = Catalog.FromName(fixtureName) with { Crest = "https://crests.football-data.org/72.png" };
        var resolved = Crests.Enrich([original, provider]);
        Assert.Equal(provider.Crest, resolved[0].Crest);
        Assert.Equal(original.Id, resolved[0].Id);
        Assert.Equal(original.Name, resolved[0].Name);
        Assert.Null(original.Crest);
    }
    [Fact]
    public void SeedCatalogueIncludesCorrectBragaCrest()
    {
        var teams = Crests.Enrich(Catalog.Teams);
        Assert.All(teams, team => Assert.NotNull(team.Crest));
        Assert.Equal("https://crests.football-data.org/5613.png", teams.Single(team => team.Id == "braga").Crest);
    }
    [Fact]
    public void DoesNotGuessByPartialClubNameOrReplaceAnExistingCrest()
    {
        var united = Catalog.FromName("Sheffield United FC") with { Crest = "https://crests.football-data.org/356.png" };
        var unrelated = Catalog.FromName("United");
        var result = Crests.Enrich([united, unrelated]);
        Assert.Null(result[1].Crest); Assert.Equal(united.Crest, result[0].Crest);
    }
}
