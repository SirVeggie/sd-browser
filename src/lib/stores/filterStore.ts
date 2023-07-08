import { writable } from "svelte/store";

export const nsfwFilter = writable('NOT FOLDER nsfw AND NOT \b(nude|sex|pussy|cum|fellatio|ahegao|lust|crotch|vagina|penis|blow ?job)\b');
export const folderFilter = writable('NOT FOLDER grid AND NOT FOLDER img2img');