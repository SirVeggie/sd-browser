import assert from 'node:assert/strict';
import {
    applyAutocompleteMatch,
    autocompleteInputAction,
    buildAutocompleteQueries,
    usefulAutocompleteMatches,
} from '../src/lib/svgen/autocompleteQuery.ts';
import { parseAutocompleteSource } from '../src/lib/server/svgen/autocompleteParser.ts';
import { compareAutocompleteMatches } from '../src/lib/server/svgen/autocompleteRank.ts';
import { sourceFileNeedsReindex } from '../src/lib/server/svgen/autocompleteFreshness.ts';
import type { AutocompleteMatch } from '../src/lib/svgen/autocompleteTypes.ts';

{
    const queries = buildAutocompleteQueries(
        '1girl, red cat ey',
        '1girl, red cat ey'.length,
        'comma',
        3,
    );
    assert.deepEqual(queries.map((query) => query.text), [
        'red cat ey',
        'cat ey',
    ]);
    assert.equal(queries[1]?.replaceStart, '1girl, red '.length);
}

{
    const value = '1girl, red hair\ngre';
    const queries = buildAutocompleteQueries(value, value.length, 'comma', 3);
    assert.deepEqual(queries.map((query) => query.text), ['gre']);
    assert.equal(queries[0]?.replaceStart, value.lastIndexOf('\n') + 1);
}

{
    const value = 'solo\r\nblue eyes';
    const queries = buildAutocompleteQueries(value, value.length, 'comma', 3);
    assert.deepEqual(queries.map((query) => query.text), ['blue eyes', 'eyes']);
    assert.equal(queries[0]?.replaceStart, value.lastIndexOf('\n') + 1);
}

{
    const value = 'foo bar\nbaz';
    const queries = buildAutocompleteQueries(value, value.length, 'word', 3);
    assert.deepEqual(queries.map((query) => query.text), ['baz']);
}

{
    assert.equal(autocompleteInputAction('insertText', 'gre', 'green'), 'search');
    assert.equal(autocompleteInputAction('insertCompositionText', 'gre', 'green'), 'search');
    assert.equal(autocompleteInputAction('deleteContentBackward', 'green', 'gree'), 'close');
    assert.equal(autocompleteInputAction(undefined, 'green', 'gree'), 'close');
    assert.equal(autocompleteInputAction(undefined, 'gre', 'green'), 'search');
    assert.equal(autocompleteInputAction('insertText', 'green', 'green'), 'ignore');
}

{
    const queries = buildAutocompleteQueries('(blue ha:1.1)', 14, 'comma', 3);
    assert.equal(queries[0]?.text, 'blue ha');
    const applied = applyAutocompleteMatch(
        '(blue ha:1.1)',
        'blue_hair',
        queries[0]!.replaceStart,
        queries[0]!.replaceEnd,
    );
    assert.equal(applied.value, '(blue_hair:1.1)');
}

{
    assert.deepEqual(
        parseAutocompleteSource('1girl, A single girl, 1 girl, one_girl'),
        [{
            value: '1girl',
            info: 'A single girl',
            aliases: ['1 girl', 'one_girl'],
        }],
    );
    assert.deepEqual(
        parseAutocompleteSource('"foo, bar", "Info, with comma", alias'),
        [{
            value: 'foo, bar',
            info: 'Info, with comma',
            aliases: ['alias'],
        }],
    );
    assert.deepEqual(
        parseAutocompleteSource('1girl,0,4114588,"1girls,sole_female"'),
        [{
            value: '1girl',
            info: 'general · 4.1M',
            aliases: ['1girls', 'sole_female'],
            score: 4114588,
        }],
    );
    assert.deepEqual(
        parseAutocompleteSource('hatsune_miku_(vocaloid),4,900,"miku,miku_(vocaloid)"'),
        [{
            value: 'hatsune miku \\(vocaloid\\)',
            info: 'character · 900',
            aliases: ['hatsune_miku_(vocaloid)', 'miku', 'miku_(vocaloid)'],
            score: 900,
        }],
    );
    assert.deepEqual(
        parseAutocompleteSource('green_shirt, A shirt, green_top'),
        [{
            value: 'green_shirt',
            info: 'A shirt',
            aliases: ['green_top'],
        }],
    );
}

{
    assert.deepEqual(
        parseAutocompleteSource(JSON.stringify([
            { name: 'blue_hair', category: 0, post_count: 1_500_000 },
            { value: 'solo', aliases: ['alone'] },
        ])),
        [
            { value: 'blue hair', aliases: ['blue_hair'], info: 'general · 1.5M', score: 1_500_000 },
            { value: 'solo', aliases: ['alone'], info: '' },
        ],
    );
}

function match(value: string, matchedText = value): AutocompleteMatch {
    return {
        sourceId: 'source',
        value,
        aliases: [],
        info: '',
        matchedText,
        matchedAlias: matchedText !== value,
        query: 'law',
        replaceStart: 0,
        replaceEnd: 3,
    };
}

{
    const values = [
        match('green_claw'),
        match('clawing'),
        match('law'),
        match('claws'),
        match('claw'),
    ].sort(compareAutocompleteMatches).map((item) => item.value);
    assert.deepEqual(values, ['law', 'claw', 'green_claw', 'claws', 'clawing']);
}

{
    const popular = {
        ...match('green_shirt', 'green_shirt'),
        query: 'green',
        score: 50_000,
    };
    const rare = {
        ...match('green_cat', 'green_cat'),
        query: 'green',
        score: 245,
    };
    assert.deepEqual(
        [rare, popular].sort(compareAutocompleteMatches).map((item) => item.value),
        ['green_shirt', 'green_cat'],
        'score beats shorter full value when the matching segment is the same length',
    );

    const shortSegment = {
        ...match('green_cat', 'green_cat'),
        query: 'green',
        score: 10,
    };
    const longSegment = {
        ...match('greenery', 'greenery'),
        query: 'green',
        score: 50_000,
    };
    assert.deepEqual(
        [longSegment, shortSegment].sort(compareAutocompleteMatches).map((item) => item.value),
        ['green_cat', 'greenery'],
        'shorter matching segment still beats a higher score',
    );
}

{
    const value = '1girl, contrapposto';
    const queries = buildAutocompleteQueries(value, value.length, 'comma', 3);
    const complete = {
        ...match('contrapposto'),
        query: queries[0]!.text,
        replaceStart: queries[0]!.replaceStart,
        replaceEnd: queries[0]!.replaceEnd,
    };
    assert.deepEqual(usefulAutocompleteMatches([complete], value), []);

    const partialValue = '1girl, contrappos';
    const partialQueries = buildAutocompleteQueries(
        partialValue,
        partialValue.length,
        'comma',
        3,
    );
    const partial = {
        ...match('contrapposto'),
        query: partialQueries[0]!.text,
        replaceStart: partialQueries[0]!.replaceStart,
        replaceEnd: partialQueries[0]!.replaceEnd,
    };
    assert.deepEqual(
        usefulAutocompleteMatches([partial], partialValue).map((item) => item.value),
        ['contrapposto'],
    );
}

{
    assert.equal(
        sourceFileNeedsReindex(1000, 2000, null),
        false,
        'missing file does not reindex',
    );
    assert.equal(
        sourceFileNeedsReindex(null, 2000, 1500),
        false,
        'legacy stored mtime skips reindex when the file is older than last index',
    );
    assert.equal(
        sourceFileNeedsReindex(null, 2000, 2500),
        true,
        'legacy stored mtime reindexes when the file is newer than last index',
    );
    assert.equal(
        sourceFileNeedsReindex(1000, 2000, 1000),
        false,
        'unchanged mtime does not reindex',
    );
    assert.equal(
        sourceFileNeedsReindex(1000, 2000, 1001),
        true,
        'changed mtime reindexes',
    );
}

console.log('autocomplete tests passed');
