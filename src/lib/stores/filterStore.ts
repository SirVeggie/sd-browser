import { writable } from "svelte/store";

export const nsfwFilter = writable('(nude|sex|pussy|cum|fellatio|ahegao|lust|crotch|vagina|penis|blow ?job)');
export const folderFilter = writable('NOT FOLDER grid AND NOT FOLDER img2img');