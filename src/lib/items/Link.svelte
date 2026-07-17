<script lang="ts">
    import { goto } from "$app/navigation";
    import { cx } from "$lib/tools/cx";

    let down = false;
    const { to, class: className, ...rest } = $$restProps as {
        to: string;
        class?: string;
        [key: string]: unknown;
    };
    let _class = cx(className, down && "down");

    function handleSpaceDown(e: KeyboardEvent) {
        if (e.key !== " ") return;
        down = true;
    }

    function handleSpaceUp(e: KeyboardEvent) {
        if (e.key !== " ") return;
        down = false;
        goto(to);
    }

    function handleFocusOut() {
        down = false;
    }
</script>

<a
    href={to}
    class={cx(_class, down && "down")}
    {...rest}
    on:click
    on:keydown={handleSpaceDown}
    on:keyup={handleSpaceUp}
    on:focusout={handleFocusOut}
>
    <slot />
</a>

<style lang="scss">
    a {
        display: inline-block;
        font-size: 0.8rem;
        line-height: 1.2;
        text-decoration: none;
        appearance: none;
        padding: 0.5em 1em;
        border: none;
        border-radius: 0.4em;
        background-color: var(--accent-soft);
        color: var(--ink);
        cursor: pointer;
        transition: background-color 0.08s ease, transform 0.08s ease;

        &:hover,
        &:focus-visible {
            background-color: rgba(196, 165, 116, 0.24);
            transform: translateY(-1px);
        }

        &:active,
        &.down {
            background-color: rgba(196, 165, 116, 0.12);
            transform: translateY(0px);
        }

        &:focus {
            outline: none;
        }

        &.accent {
            background: var(--accent-soft);
            color: var(--accent);
        }

        &.icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            min-height: calc(0.8rem * 1.2 + 1em);
            min-width: calc(0.8rem * 1.2 + 1em);
            padding: 0.35em;
            border: none;
            border-radius: 0.4em;
            background: transparent;
            color: var(--ink);
            line-height: 0;
            transform: none;
            transition: color 0.12s ease;

            :global(svg) {
                display: block;
                width: 18px;
                height: 18px;
            }

            &:hover,
            &:focus-visible {
                color: var(--accent);
                background: transparent;
                border: none;
                transform: none;
            }

            &:active,
            &.down {
                background: transparent;
                transform: none;
            }
        }

        &.ghost {
            border: none;
            background: rgba(255, 255, 255, 0.03);
            color: var(--ink);
            border-radius: 999px;
            transform: none;

            &:hover,
            &:focus-visible {
                background: rgba(255, 255, 255, 0.1);
                transform: none;
            }

            &.danger {
                color: var(--danger);

                &:hover,
                &:focus-visible {
                    background: rgba(196, 122, 106, 0.16);
                }
            }
        }
    }
</style>
