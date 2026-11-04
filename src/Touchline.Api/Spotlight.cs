using System.Text.RegularExpressions;

namespace Touchline;

public static partial class Spotlight
{
    [GeneratedRegex(@"\b(?:(?:great|amazing|beautiful|brilliant|fantastic|stunning|incredible|spectacular|sensational|superb|wonderful)\s+(?:(?:team|solo)\s+)?(?:goal|strike|free[ -]?kick|assist)|screamer|banger|golazo|worldie|wondergoal|wonder\s+goal|bicycle\s+kick|overhead\s+kick)\b", RegexOptions.IgnoreCase)]
    private static partial Regex Label();
    [GeneratedRegex(@"\b(?:not|isn't|wasn't|isn’t|wasn’t)(?:\s+(?:a|an|so|really|particularly|that|very)){0,3}\s*$", RegexOptions.IgnoreCase)]
    private static partial Regex Negated();
    public static string? Reason(string title)
    {
        foreach (Match match in Label().Matches(title))
        {
            if (Negated().IsMatch(title[..match.Index])) continue;
            var label = Regex.Replace(match.Value.ToLowerInvariant(), @"\s+", " ");
            return char.ToUpperInvariant(label[0]) + label[1..];
        }
        return null;
    }
}
