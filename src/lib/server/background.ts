import { TaskManager } from "$lib/tools/task";

export const backgroundTasks = new TaskManager<any>(10, 10);