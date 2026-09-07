import assert from 'node:assert/strict';
import { formatUnknownError } from '../src/lib/svgen/formatError.ts';

{
    assert.equal(formatUnknownError(null, 'fallback'), 'fallback');
    assert.equal(formatUnknownError(undefined, 'fallback'), 'fallback');
    assert.equal(formatUnknownError('  boom  '), 'boom');
    assert.equal(formatUnknownError(new Error('nope')), 'nope');
}

{
    const comfy = {
        error: {
            type: 'prompt_outputs_failed_validation',
            message: 'Prompt outputs failed validation',
            details: 'Required input is missing',
        },
        node_errors: {
            '3': {
                class_type: 'CheckpointLoaderSimple',
                errors: [{
                    type: 'value_not_in_list',
                    message: 'Value not in list',
                    details: "ckpt_name: 'missing.safetensors' not in []",
                }],
            },
        },
    };
    assert.equal(
        formatUnknownError(comfy),
        [
            'Prompt outputs failed validation: Required input is missing',
            "CheckpointLoaderSimple (#3): Value not in list: ckpt_name: 'missing.safetensors' not in []",
        ].join('\n'),
    );
}

{
    assert.equal(
        formatUnknownError({ error: { type: 'x', message: 'bad graph' } }),
        'bad graph',
    );
    assert.equal(
        String({ type: 'x', message: 'bad graph' }),
        '[object Object]',
        'sanity: raw String() is what the panel used to show',
    );
    assert.notEqual(
        formatUnknownError({ type: 'x', message: 'bad graph' }),
        '[object Object]',
    );
}

{
    assert.equal(
        formatUnknownError({
            node_id: '9',
            node_type: 'KSampler',
            exception_type: 'RuntimeError',
            exception_message: 'CUDA out of memory',
        }),
        'KSampler: RuntimeError: CUDA out of memory',
    );
}

{
    const wrapped = new Error('[object Object]', {
        cause: {
            error: { message: 'Prompt outputs failed validation', details: '' },
        },
    });
    assert.equal(formatUnknownError(wrapped), 'Prompt outputs failed validation');
}

{
    assert.equal(
        formatUnknownError({ foo: 1, bar: 'x' }),
        '{"foo":1,"bar":"x"}',
    );
    assert.equal(
        formatUnknownError({
            error: '[object Object]',
            detail: { error: { message: 'Prompt outputs failed validation' } },
        }),
        'Prompt outputs failed validation',
    );
}
