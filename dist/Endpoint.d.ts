export declare class Endpoint {
    app: any;
    /**
     * Name of the Endpoint, used only for reporting.
     */
    name: string;
    /**
     * IP address of the remote endpoint.
     */
    ipAddress: string;
    /**
     * Port number of the remote endpoint.
     */
    port: number;
    /**
     * Whether or not the Endpoint is active.
     */
    enabled: boolean;
    /**
     * Configured intervals and related properties.
     */
    intervals: Intervals;
    /**
     * Accumulated transmission statistics.
     */
    statistics: Statistics;
    constructor(options: any[], app: any);
    dump(): void;
    updateStatistics(reportType: string, update: ReportStatistics): void;
}
export type { ReportStatistics };
interface Intervals {
    positionUpdateIntervals: number[];
    staticUpdateIntervals: number[];
    myPositionUpdateIntervals: number[];
    myStaticUpdateIntervals: number[];
    navigationStateMap: any;
}
interface Statistics {
    started: number | undefined;
    totalBytes: number;
    position: ReportStatistics;
    static: ReportStatistics;
}
interface ReportStatistics {
    self: {
        reports: number;
        bytes: number;
    };
    others: {
        reports: number;
        bytes: number;
    };
}
