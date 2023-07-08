export function cx(...args: any[]): string {
    return args.filter(x => typeof x === 'string').join(' ');
}