<script lang="ts">
    export let placeholder = "Enter your name";
    export let value = "";
</script>

<input type="text" {placeholder} bind:value />

<style lang="scss">
    input {
        font-family: "Open sans", sans-serif;
        width: 100%;
        height: 40px;
        background-color: #333;
        color: #ddd;
        border-radius: 0.5em;
        border: 0px solid transparent;
        padding: 1em;
        margin-top: 1em;
        box-shadow: inset 0px 2px 3px #0005;
        border: 1px solid #1118;
        box-sizing: border-box;
        
        &:focus {
            outline: none;
            border: 1px solid #aaad;
        }
    }
</style>