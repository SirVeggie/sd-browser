<script lang="ts">
    export let placeholder = "";
    export let value = "";
</script>

<input type="text" {placeholder} on:change on:input bind:value />

<style lang="scss">
    input {
        font-family: "Open sans", sans-serif;
        width: 100%;
        // height: 2.2em;
        background-color: #333;
        color: #ddd;
        border-radius: 0.5em;
        border: 0px solid transparent;
        padding: 0.5em 0.5em;
        box-shadow: inset 0px 2px 3px #0005;
        border: 1px solid #1118;
        // border: 1px solid #fff;
        box-sizing: border-box;
        
        &:focus {
            outline: none;
            border: 1px solid #aaad;
        }
    }
</style>