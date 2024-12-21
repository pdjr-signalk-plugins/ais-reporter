export declare class Endpoint {
    name: string;
    ipAddress: string;
    port: number;
    myVessel: Vessel;
    otherVessels: Vessel;
    statistics: Statistics;
    constructor(option: any, options: any, defaults: any);
    updateStatistics(reportType: string, update: ReportStatistics): void;
}
export type { ReportStatistics };
interface Vessel {
    expiryInterval: number;
    positionUpdateIntervals: number[];
    staticUpdateIntervals: number[];
    updateIntervalIndexPath: string;
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
