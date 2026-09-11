import assert from 'node:assert/strict';
import { bindKeyedElement } from '../src/lib/tools/keyedElementMap.ts';

function el(): HTMLElement {
    return { id: Math.random().toString(36) } as HTMLElement;
}

{
    const map = new Map<string, HTMLElement>();
    const action = bindKeyedElement(map);
    const node = el();
    const binding = action(node, 'a');
    assert.equal(map.get('a'), node);
    binding.destroy();
    assert.equal(map.has('a'), false);
}

{
    const map = new Map<string, HTMLElement>();
    const action = bindKeyedElement(map);
    const node = el();
    const binding = action(node, 'a');
    binding.update('b');
    assert.equal(map.has('a'), false);
    assert.equal(map.get('b'), node);
    binding.destroy();
    assert.equal(map.has('b'), false);
}

// Earlier-{#each} remount: new node registers first, then the old action destroys.
{
    const map = new Map<string, HTMLElement>();
    const action = bindKeyedElement(map);
    const oldNode = el();
    const newNode = el();
    const oldBinding = action(oldNode, 'card');
    action(newNode, 'card');
    oldBinding.destroy();
    assert.equal(map.get('card'), newNode);
}

// Later-{#each} remount: old node destroys first, then the new one registers.
{
    const map = new Map<string, HTMLElement>();
    const action = bindKeyedElement(map);
    const oldNode = el();
    const newNode = el();
    const oldBinding = action(oldNode, 'card');
    oldBinding.destroy();
    action(newNode, 'card');
    assert.equal(map.get('card'), newNode);
}
