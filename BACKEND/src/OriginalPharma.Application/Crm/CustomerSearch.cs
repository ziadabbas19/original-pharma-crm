using System.Linq.Expressions;
using OriginalPharma.Domain.Crm;

namespace OriginalPharma.Application.Crm;

/// <summary>How close a customer's name is to a search, for ordering (runs as SQL on the search columns).</summary>
public static class CustomerSearch
{
    /// <summary>
    /// 0: the whole name is the text; 1: the name starts with it; 2: a word of the name starts with it;
    /// 3: anything else (the name contains it somewhere). Either name (main or Arabic) counts.
    /// <paramref name="term"/> must already be normalized (<see cref="CustomerNameSearch.Normalize"/>).
    /// </summary>
    public static Expression<Func<Customer, int>> Closeness(string term)
    {
        var wordStart = " " + term;
        return c =>
            c.NameSearch == term || c.NameArSearch == term ? 0
            : c.NameSearch.StartsWith(term) || (c.NameArSearch != null && c.NameArSearch.StartsWith(term)) ? 1
            : (" " + c.NameSearch).Contains(wordStart) || (c.NameArSearch != null && (" " + c.NameArSearch).Contains(wordStart)) ? 2
            : 3;
    }
}
