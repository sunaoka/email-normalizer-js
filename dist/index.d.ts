export interface MxRecord {
    priority: number;
    host: string;
}
export interface Result {
    readonly address: string;
    readonly normalizedAddress: string;
    readonly mxRecords: readonly MxRecord[];
    readonly mailboxProvider: string | null;
}
export interface NormalizerOptions {
    cacheLimit?: number;
    cacheFailures?: boolean;
    failureTtl?: number;
    skipDns?: boolean;
}
export declare function normalize(emailAddress: string, options?: {
    skipDns?: boolean;
}): Promise<Result>;
export declare class Normalizer {
    readonly cacheLimit: number;
    readonly cacheFailures: boolean;
    readonly failureTtl: number;
    private readonly skipDns;
    constructor(options?: NormalizerOptions);
    normalize(emailAddress: string): Promise<Result>;
    mxRecords(domainPart: string): Promise<MxRecord[]>;
    static clearCache(): void;
    protected resolveMxRecords(domainPart: string): Promise<MxRecord[] | null>;
    private parseAddress;
    private localPartAsHostname;
    private shouldStripPeriods;
    private lookupProviderByDomain;
    private lookupProvider;
    private shouldResolve;
    private pruneCache;
    private sortMxRecords;
}
//# sourceMappingURL=index.d.ts.map