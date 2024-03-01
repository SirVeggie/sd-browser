/* eslint-disable @typescript-eslint/no-explicit-any */
export type RePromise<T> = Promise<T> & {
    resolve: (value: T) => void,
    reject: (reason?: any) => void;
    state: 'pending' | 'resolved' | 'rejected';
    value?: T;
    reason?: any;
}

export function RePromise<T>(): RePromise<T> {
    let aResolve: any;
    let aReject: any;
    
    const promise: any = new Promise((resolve, reject) => {
        aResolve = resolve;
        aReject = reject;
    });

    promise.state = 'pending';
    promise.resolve = (value: T) => {
        if (promise.state === 'pending') {
            promise.value = value;
            promise.state = 'resolved';
            aResolve(value);
        }
    };
    promise.reject = (reason?: any) => {
        if (promise.state === 'pending') {
            promise.reason = reason;
            promise.state = 'rejected';
            aReject(reason);
        }
    };
    return promise;
}

export function RePromisify<T>(promise: Promise<T>): RePromise<T> {
    let aResolve: any;
    let aReject: any;
    
    const internal: any = new Promise((resolve, reject) => {
        aResolve = resolve;
        aReject = reject;
    });

    internal.state = 'pending';
    internal.resolve = (value: T) => {
        if (internal.state === 'pending') {
            internal.value = value;
            aResolve(value);
            internal.state = 'resolved';
        }
    };
    internal.reject = (reason?: any) => {
        if (internal.state === 'pending') {
            internal.reason = reason;
            aReject(reason);
            internal.state = 'rejected';
        }
    };
    
    promise.then(internal.resolve).catch(internal.reject);
    return internal;
}