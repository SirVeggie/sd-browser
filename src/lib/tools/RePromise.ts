/* eslint-disable @typescript-eslint/no-explicit-any */
export type RePromise<T> = Promise<T> & {
    resolve: (value: T) => void,
    reject: (reason?: any) => void;
    state: 'pending' | 'resolved' | 'rejected';
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
            aResolve(value);
            promise.state = 'resolved';
        }
    };
    promise.reject = (reason?: any) => {
        if (promise.state === 'pending') {
            aReject(reason);
            promise.state = 'rejected';
        }
    };
    return promise;
}