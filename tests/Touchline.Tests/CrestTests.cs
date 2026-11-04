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
        Assert.StartsWith("/crests/", resolved[0].Crest);
        Assert.Equal(provider.Crest, resolved[1].Crest);
        Assert.Equal(original.Id, resolved[0].Id);
        Assert.Equal(original.Name, resolved[0].Name);
        Assert.Null(original.Crest);
    }
    [Fact]
    public void SeedCatalogueIncludesCorrectBragaCrest()
    {
        var teams = Crests.Enrich(Catalog.Teams);
        Assert.All(teams, team => Assert.NotNull(team.Crest));
        Assert.Equal("/crests/5613.png", teams.Single(team => team.Id == "braga").Crest);
    }
    [Theory]
    [InlineData("AEK Athens", "1899")]
    [InlineData("Dortmund U19", "4")]
    [InlineData("Manchester Utd U19", "66")]
    [InlineData("Real Betis Women", "90")]
    [InlineData("Slavia Prague", "930")]
    [InlineData("QPR", "69")]
    [InlineData("Wolves", "76")]
    public void BundledCrestsWorkWithoutFixtureAccess(string name, string id)
    {
        var original = Catalog.FromName(name);
        var resolved = Assert.Single(Crests.Enrich([original]));
        Assert.Equal($"/crests/{id}.png", resolved.Crest);
        Assert.Equal(original.Id, resolved.Id);
        Assert.Equal(original.Name, resolved.Name);
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
