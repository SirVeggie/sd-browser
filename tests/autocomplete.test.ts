import assert from 'node:assert/strict';
import {
    applyAutocompleteMatch,
    buildAutocompleteQueries,
    usefulAutocompleteMatches,
} from '../src/lib/svgen/autocompleteQuery.ts';
import { parseAutocompleteSource } from '../src/lib/server/svgen/autocompleteParser.ts';
import { compareAutocompleteMatches } from '../src/lib/server/svgen/autocompleteRank.ts';
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
            { value: 'blue_hair', aliases: [], info: 'general · 1.5M' },
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

console.log('autocomplete tests passed');
