import { writable } from "svelte/store";

class SelectManager {
    private objects: string[] = [];
    private lastSelection = "";
    private selected: string[] = [];

    setObjects(objects: string[]) {
        this.objects = objects;
        this.selected = this.selected.filter((object) => objects.includes(object));
        if (!this.selected.includes(this.lastSelection)) {
            this.lastSelection = "";
        }
    }

    select(target: string) {
        if (this.selected.includes(target)) {
            this.selected.splice(this.selected.indexOf(target), 1);
            this.lastSelection = target;
            if (this.selected.length === 0) {
                this.lastSelection = "";
            }
            return;
        }

        if (!this.objects.includes(target)) {
            return;
        }

        this.selected.push(target);
        this.lastSelection = target;
    }

    deselectAll() {
        this.selected = [];
        this.lastSelection = "";
    }

    selectRow(target: string) {
        if (!this.objects.includes(target)) {
            return;
        }

        const start = this.objects.indexOf(this.lastSelection);
        const end = this.objects.indexOf(target);
        const [min, max] = [Math.min(start, end), Math.max(start, end)];
        const items = this.objects.slice(min, max + 1);
        const notSelected = items.filter((item) => !this.selected.includes(item));
        
        if (notSelected.length === 0 || (notSelected.length === 1 && notSelected[0] === this.lastSelection)) {
            this.selected = this.selected.filter((item) => !items.includes(item));
            this.lastSelection = target;
        } else {
            this.selected.push(...notSelected);
            this.lastSelection = target;
        }
    }

    getSelected() {
        return this.selected;
    }
}

export function createSelection() {
    const manager = new SelectManager();
    const { subscribe, set } = writable<string[]>([]);

    return {
        subscribe,
        setObjects: (objects: string[]) => action(() => manager.setObjects(objects)),
        select: (target: string) => action(() => manager.select(target)),
        deselectAll: () => action(() => manager.deselectAll()),
        selectRow: (target: string) => action(() => manager.selectRow(target)),
    };

    function action(func: any) {
        func();
        set(manager.getSelected());
    }
}
