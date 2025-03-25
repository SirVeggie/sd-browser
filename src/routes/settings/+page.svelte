<script lang="ts">
    import Input from "$lib/items/Input.svelte";
    import { onDestroy } from "svelte";
    import Link from "../../lib/items/Link.svelte";
    import {
        flyoutButton,
        flyoutButtonTop,
        flyoutHistory,
        flyoutStore,
    } from "$lib/stores/flyoutStore";
    import Button from "$lib/items/Button.svelte";
    import { notify } from "$lib/components/Notifier.svelte";
    import {
        animatedThumb,
        compressedMode,
        folderFilter,
        initialImages,
        matchingMode,
        nsfwFilter,
        slideDelay,
        thumbMode,
    } from "$lib/stores/searchStore";
    import {
        flyoutModes,
        qualityModes,
        searchKeywords,
        searchModes,
    } from "$lib/types/misc";
    import { fullscreenState } from "$lib/stores/fullscreenStore";
    import {
        fullscreenStyle,
        imageSize,
        seamlessStyle,
    } from "$lib/stores/styleStore";
    import NumInput from "$lib/items/NumInput.svelte";
    import { authLogout, authStore } from "$lib/stores/authStore";
    import { pullGlobalSettings } from "$lib/requests/settingRequests";
    import {
        closeContextMenu,
        openContextMenu,
    } from "$lib/items/ContextMenu.svelte";

    let inputTimer: any;
    let address = $flyoutStore.url;
    let flyoutMode = $flyoutStore.mode;
    let flyoutContext = "";
    let flyoutHistoryLength = 5;
    let flyoutButtonPosition = $flyoutButtonTop ? "top" : "bottom";

    $: setInput($flyoutStore.url);

    let refreshInterval: any = setInterval(() => {
        pullGlobalSettings();
    }, 1000);

    onDestroy(() => {
        clearTimeout(inputTimer);
        inputTimer = undefined;
        clearInterval(refreshInterval);
        refreshInterval = undefined;
    });

    function setInput(value: string) {
        address = value;
    }

    function onInput() {
        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
            closeContextMenu(flyoutContext);

            const old = $flyoutStore.url;
            if (address === old) return;

            flyoutStore.update((x) => ({ ...x, url: address }));

            flyoutHistory.update((history) => {
                history = history.filter(
                    (item) => item !== address && item !== old,
                );
                if (old) history.unshift(old);
                if (address && address !== old) history.unshift(address);
                return history.slice(0, flyoutHistoryLength + 1);
            });
            notify(`Flyout address set to '${address}'`);
        }, 2000);
    }

    function onFlyoutModeChange() {
        flyoutStore.update((x) => ({ ...x, mode: flyoutMode }));
    }

    function onFlyoutButtonPositionChange() {
        $flyoutButtonTop = flyoutButtonPosition === "top";
    }

    function reset() {
        notify(`LocalStorage was cleared`);
        localStorage.clear();
        window.location.reload();
    }

    function logout() {
        notify(`Logging out`);
        authLogout();
    }

    function flyoutFocus(e: FocusEvent) {
        setTimeout(() => {
            const rect = (e.target as Element).getBoundingClientRect();
            flyoutContext = openContextMenu(
                {
                    x: rect.left - 15,
                    y: rect.bottom,
                },
                $flyoutHistory
                    .filter((x) => x !== $flyoutStore.url)
                    .map((x) => ({
                        name: x,
                        handler() {
                            address = x;
                            const old = $flyoutStore.url;

                            flyoutStore.update((prev) => ({ ...prev, url: x }));

                            flyoutHistory.update((history) => {
                                history = history.filter(
                                    (item) => item !== x && item !== old,
                                );
                                if (old) history.unshift(old);
                                if (x !== old) history.unshift(x);
                                return history.slice(
                                    0,
                                    flyoutHistoryLength + 1,
                                );
                            });
                            notify(`Flyout address set to '${x}'`);
                        },
                    })),
            );
        }, 150);
    }

    function flyoutBlur() {
        // closeContextMenu(flyoutContext);
    }
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div class="container">
    <div class="buttons">
        <Link to="/">Back</Link>
        <Button on:click={reset}>Reset</Button>
        {#if $authStore.password}
            <Button on:click={logout}>Logout</Button>
        {/if}
    </div>

    <div class="gray">
        Keyboard shortcuts:<br />
        <div class="list">
            <span>Esc: Cancel</span>
            <span>Arrows: Browse images</span>
            <span>Space: toggle slideshow</span>
            <span>F: toggle flyout</span>
        </div>
    </div>

    <div class="sgroup">
        <label class="checkbox">
            Flyout enabled:
            <input type="checkbox" bind:checked={$flyoutStore.enabled} />
        </label>

        <div class="wrapper" class:isOpen={$flyoutStore.enabled}>
            <div class="inner">
                <!-- svelte-ignore a11y-label-has-associated-control -->
                <label>
                    Address (webui url)
                    <Input
                        bind:value={address}
                        on:input={onInput}
                        on:focus={flyoutFocus}
                        on:blur={flyoutBlur}
                    />
                </label>

                <label for="matching">
                    Styling:
                    <select
                        id="matching"
                        bind:value={flyoutMode}
                        on:change={onFlyoutModeChange}
                    >
                        {#each flyoutModes as mode}
                            <option value={mode}>{mode}</option>
                        {/each}
                    </select>
                </label>

                <label class="checkbox">
                    Show button:
                    <input type="checkbox" bind:checked={$flyoutButton} />
                </label>

                <label for="matching">
                    Button position:
                    <select
                        id="matching"
                        bind:value={flyoutButtonPosition}
                        on:change={onFlyoutButtonPositionChange}
                    >
                        {#each ["top", "bottom"] as mode}
                            <option value={mode}>{mode}</option>
                        {/each}
                    </select>
                </label>
            </div>
        </div>
    </div>

    <div class="gray">
        Search keywords:<br /><span>
            {searchKeywords.join(", ").replaceAll("|", " | ")}
        </span>
    </div>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        Folder filter
        <span class="gray">
            (Hides images in img2img, xxx-grids and extra folders by default)
        </span>
        <Input bind:value={$folderFilter} />
    </label>
    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        NSFW filter
        <span class="gray">
            (Added to the search when NSFW toggle is disabled)
        </span>
        <Input bind:value={$nsfwFilter} />
    </label>

    <label for="matching">
        Matching:
        <select id="matching" bind:value={$matchingMode}>
            {#each searchModes as method}
                <option value={method}>{method}</option>
            {/each}
        </select>
    </label>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        Initial amount of images loaded (default: 25)
        <NumInput bind:value={$initialImages} />
    </label>

    <span class="gray">
        Image quality settings:
        <br />
        When using locally, recommended to use original and low
        <br />
        When using remotely, recommended to use medium and low for faster loading
        <br />
        Setting thumbnails to low allows for smoother scrolling even locally
        <br />
        * medium and low are slightly slower when seeing an image for the first time
    </span>

    <label for="fullimage">
        Full size quality:
        <select id="fullimage" bind:value={$compressedMode}>
            {#each qualityModes as quality}
                <option value={quality}>{quality}</option>
            {/each}
        </select>
    </label>

    <label for="thumbnail">
        Thumbnail quality:
        <select id="thumbnail" bind:value={$thumbMode}>
            {#each qualityModes as quality}
                <option value={quality}>{quality}</option>
            {/each}
        </select>
    </label>

    <label class="checkbox">
        Animate thumbnail for videos:
        <input type="checkbox" bind:checked={$animatedThumb} />
    </label>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        Slideshow interval (milliseconds)
        <NumInput bind:value={$slideDelay} />
    </label>

    <span class="gray"> Visual style settings </span>

    <label class="checkbox">
        Maximize fullscreen image size:
        <input type="checkbox" bind:checked={$fullscreenStyle} />
    </label>

    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label>
        Image grid size offset:
        <Input
            bind:value={$imageSize}
            placeholder="-100 (pixels) or 10vw + 50px"
        />
    </label>

    <label class="checkbox">
        Seamless grid:
        <input type="checkbox" bind:checked={$seamlessStyle} />
    </label>

    <span class="gray">
        PWA fullscreen:
        <br />
        Enable this setting before adding to homescreen to disable mobile UI elements
        <br />
        Results depend on browser support (status bar, taskbar on tablets)
    </span>

    <label class="checkbox">
        PWA fullscreen:
        <input type="checkbox" bind:checked={$fullscreenState} />
    </label>
</div>

<style lang="scss">
    .container {
        padding: var(--main-padding);
        display: flex;
        flex-direction: column;
        gap: 1.5em;
    }

    .buttons :global(.disabled) {
        opacity: 0.5;
        filter: grayscale(1);
    }

    .gray {
        font-size: 0.8em;
        color: #aaa;
    }

    .sgroup {
        --gap: 10px;
        display: flex;
        flex-direction: column;
        gap: var(--gap);
        // border: 1px solid #aaaa;
        outline: solid 1px #aaa4;
        outline-offset: 10px;
        border-radius: 5px;
        padding: 10px;
    }

    .wrapper {
        display: grid;
        grid-template-rows: 0fr;
        transition:
            grid-template-rows 0.5s ease,
            margin-top 0.5s ease;
        margin-top: calc(0px - var(--gap));

        &.isOpen {
            position: relative;
            grid-template-rows: 1fr;
            margin-top: 0px;
        }

        .inner {
            display: flex;
            flex-direction: column;
            gap: var(--gap);
            overflow: hidden;
            padding: 0;
            margin: 0;

            & > :first-child {
                border-top: dashed 1px #aaa4;
                padding-top: var(--gap);
            }
        }
    }

    .list {
        display: flex;
        gap: 2em;
    }

    label {
        cursor: pointer;
        user-select: none;

        &.checkbox {
            display: flex;
            align-items: center;
            gap: 0.5em;
        }
    }

    input[type="checkbox"] {
        appearance: none;
        background-color: #333;
        border-radius: 0.2em;
        font-size: 1em;
        width: 13px;
        height: 13px;
        margin: 0;
        padding: 0;
        border: none;
        cursor: pointer;
        position: relative;
        outline: 1px solid #aaa3;

        &::before {
            content: "";
            position: absolute;
            background-color: rgb(63, 187, 236);
            top: 2px;
            left: 2px;
            right: 2px;
            bottom: 2px;
            transform: scale(0);
            opacity: 0;
            transition:
                120ms transform ease,
                120ms opacity ease;
            border-radius: 0.15em;
        }

        &:checked::before {
            transform: scale(1);
            opacity: 1;
        }
    }

    select {
        margin: 0;
        padding: 0;
        background-color: transparent;
        border: none;
        font-family: "Open sans", sans-serif;
        font-size: 1em;
        color: #ddd;
        border-radius: 0.2em;

        &:focus {
            outline: none;
        }

        &:focus-visible {
            background-color: #333;
        }

        option {
            background-color: #222;
        }
    }
</style>
