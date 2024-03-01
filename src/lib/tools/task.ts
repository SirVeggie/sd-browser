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
    private limit = 10;
    private idleDelay = 10;
    private donePromise: RePromise<void>;
    private startPromise: RePromise<void>;
    
    running = 0;
    looping = false;
    
    constructor(concurrentLimit: number, idleDelay: number) {
        this.limit = concurrentLimit;
        this.idleDelay = idleDelay;
        this.donePromise = RePromise();
        this.donePromise.resolve();
        this.startPromise = RePromise();
    }

    async startTaskLoop() {
        this.looping = true;
        
        if (this.donePromise.state !== 'pending') {
            this.donePromise = RePromise();
        }
        
        this.startPromise.resolve();
        
        while (this.looping) {
            if (this.running >= this.limit) {
                await sleep(this.idleDelay);
                continue;
            }
            
            const task = this.tasks.shift();
            if (task) {
                this.running++;
                task.start().then(() => {
                    this.running--;
                }).catch(() => {
                    this.running--;
                });
            } else if (this.running > 0) {
                await sleep(this.idleDelay);
            } else {
                break;
            }
        }
        
        this.startPromise = RePromise();
        this.donePromise.resolve();
        this.looping = false;
    }

    addTask(task: Task<T>) {
        this.tasks.push(task);
        
        if (!this.looping) {
            this.startTaskLoop();
        }
        
        return task.wait()
    }
    
    addWork(work: () => Promise<T>) {
        return this.addTask(new Task(work));
    }
    
    wait() {
        return this.donePromise;
    }
    
    waitForStart() {
        return this.startPromise;
    }
}

function sleep(ms: number): Promise<unknown> {
    return new Promise(res => setTimeout(res, ms));
}