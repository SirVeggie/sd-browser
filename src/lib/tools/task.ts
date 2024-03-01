import { v4 as uuid } from 'uuid';
import { RePromise } from './RePromise';

export class Task<T> {
    private promise: RePromise<T>;
    private work: () => Promise<T>;

    id: string;
    state: 'pending' | 'running' | 'finished' | 'failed' = 'pending';
    result: T | null = null;
    error: any = null;

    constructor(work: () => Promise<T>) {
        this.id = uuid();
        this.work = work;
        this.promise = RePromise();
    }

    start() {
        if (this.state !== 'pending') {
            throw new Error('Task already started');
        }
        this.state = 'running';

        this.work().then(res => {
            this.result = res;
            this.state = 'finished';
            this.promise.resolve(res);
        }).catch(err => {
            this.error = err;
            this.state = 'failed';
            this.promise.reject(err);
        });

        return this.promise;
    }

    wait() {
        return this.promise;
    }
}

export class TaskManager<T> {
    private tasks: Task<T>[] = [];
    private priority: Task<T>[] = [];
    private idleDelay = 10;
    private donePromise: RePromise<void>;
    private startPromise: RePromise<void>;
    private running: Task<T>[] = [];
    
    limit = 10;
    looping = false;
    isStack: boolean;

    constructor(concurrentLimit: number, idleDelay: number, isStack = false) {
        this.limit = concurrentLimit;
        this.idleDelay = idleDelay;
        this.donePromise = RePromise();
        this.donePromise.resolve();
        this.startPromise = RePromise();
        this.isStack = isStack;
    }

    private async startTaskLoop() {
        this.looping = true;

        if (this.donePromise.state !== 'pending') {
            this.donePromise = RePromise();
        }

        this.startPromise.resolve();

        while (this.looping) {
            if (this.running.length >= this.limit) {
                await this.waitOne();
                continue;
            }

            let task: Task<T> | undefined;
            if (this.priority.length > 0) {
                task = this.isStack ? this.priority.pop() : this.priority.shift();
            } else {
                task = this.isStack ? this.tasks.pop() : this.tasks.shift();
            }

            if (task) {
                this.running.push(task);
                task.start().finally(() => this.removeRunning(task!));
            } else if (this.running.length > 0) {
                await sleep(this.idleDelay);
            } else {
                break;
            }
        }

        this.startPromise = RePromise();
        this.donePromise.resolve();
        this.looping = false;
    }

    private removeRunning(task: Task<T>) {
        const index = this.running.indexOf(task);
        if (index >= 0) {
            this.running.splice(index, 1);
        }
    }

    addTask(task: Task<T>, priority = false) {
        if (priority) {
            this.priority.push(task);
        } else {
            this.tasks.push(task);
        }

        if (!this.looping) {
            this.startTaskLoop();
        }

        return task.wait();
    }

    addWork(work: () => Promise<T>, priority = false) {
        return this.addTask(new Task(work), priority);
    }

    wait() {
        return this.donePromise;
    }

    waitOne() {
        return Promise.race(this.running.map(task => task.wait()));
    }

    waitForStart() {
        return this.startPromise;
    }
}

function sleep(ms: number): Promise<unknown> {
    return new Promise(res => setTimeout(res, ms));
}