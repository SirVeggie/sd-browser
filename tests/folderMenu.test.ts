import assert from "node:assert/strict";
import {
    buildFolderTree,
    folderTreeToMenuOptions,
    type FolderContextMenuOption,
} from "../src/lib/tools/folderMenu.ts";

assert.deepEqual(buildFolderTree(["/", "foo", "foo/bar", "foo/bar/baz", "foo/qux", "other"]), [
    { path: "/", name: "/", children: [] },
    {
        path: "foo",
        name: "foo",
        children: [
            {
                path: "foo/bar",
                name: "bar",
                children: [{ path: "foo/bar/baz", name: "baz", children: [] }],
            },
            { path: "foo/qux", name: "qux", children: [] },
        ],
    },
    { path: "other", name: "other", children: [] },
]);

const selected: string[] = [];
const menu = folderTreeToMenuOptions(
    buildFolderTree(["/", "foo", "foo/bar", "foo/baz", "other"]),
    {
        type: "move",
        onSelect: (folder) => selected.push(folder),
    },
);

assert.equal(menu.length, 3);
assert.equal(menu[0].name, "/");
assert.equal(menu[0].submenu, undefined);
assert.equal(menu[1].name, "foo");
assert.equal(menu[1].submenu, true);
assert.equal(menu[2].name, "other");
assert.equal(menu[2].submenu, undefined);

const fooChildren = menu[1].handler() as FolderContextMenuOption[];
assert.deepEqual(
    fooChildren.map((option) => ({ name: option.name, submenu: !!option.submenu })),
    [
        { name: "Move here", submenu: false },
        { name: "bar", submenu: false },
        { name: "baz", submenu: false },
    ],
);

fooChildren[0].handler();
assert.deepEqual(selected, ["foo"]);

const excludedMenu = folderTreeToMenuOptions(
    buildFolderTree(["foo", "foo/bar", "foo/bar/baz"]),
    {
        type: "copy",
        excludedPath: "foo/bar",
        onSelect: () => {},
    },
);

assert.equal(excludedMenu.length, 1);
assert.equal(excludedMenu[0].name, "foo");
assert.equal(excludedMenu[0].submenu, true);

const underFoo = excludedMenu[0].handler() as FolderContextMenuOption[];
assert.deepEqual(
    underFoo.map((option) => ({ name: option.name, submenu: !!option.submenu })),
    [
        { name: "Copy here", submenu: false },
        { name: "bar", submenu: true },
    ],
);

const underBar = underFoo[1].handler() as FolderContextMenuOption[];
assert.deepEqual(
    underBar.map((option) => ({ name: option.name, submenu: !!option.submenu })),
    [{ name: "baz", submenu: false }],
);

const fullyExcluded = folderTreeToMenuOptions(buildFolderTree(["solo"]), {
    type: "move",
    excludedPath: "solo",
    onSelect: () => {},
});
assert.deepEqual(fullyExcluded, []);

console.log("folderMenu.test.ts passed");
