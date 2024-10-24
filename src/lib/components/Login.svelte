<script lang="ts">
    import { authStore } from "$lib/stores/authStore";
    import { notify } from "./Notifier.svelte";
    import { attemptLogin } from "$lib/requests/authRequests";
    import Input from "$lib/items/Input.svelte";

    let password = "";
    let timer: any;

    async function login() {
        authStore.set({
            password,
            valid: false,
        });

        if (await attemptLogin()) {
            authStore.set({
                password,
                valid: true,
            });
            notify("Login successful", "success");
        } else {
            authStore.set({
                password,
                valid: false,
            });
            notify("Login failed", "error");
        }
    }

    function onInput() {
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (password.length > 0) {
                login();
            }
        }, 1000);
    }
</script>

<div class="login">
    <h1>Login</h1>
    <div>
        <Input
            password
            placeholder="Password"
            bind:value={password}
            on:input={onInput}
        />
    </div>
</div>

<style lang="scss">
    .login {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;

        div {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            gap: 0.5em;
        }
    }
</style>
