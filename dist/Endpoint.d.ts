export declare class Endpoint {
    app: any;
    name: string;
    ipAddress: string;
    port: number;
    myAisReportClass: string;
    enabled: boolean;
    intervals: Intervals;
    statistics: Statistics;
    constructor(options: any[], app: any);
    updateStatistics(spbt: number, ssbt: number, tpbt: number, tsbt: number): void;
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
