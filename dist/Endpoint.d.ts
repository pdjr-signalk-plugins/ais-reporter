export declare class Endpoint {
    name: string;
    ipAddress: string;
    port: number;
    myVessel: Vessel;
    otherVessels: Vessel;
    statistics: Statistics;
    constructor(option: any, options: any, defaults: any);
}
interface Vessel {
    expiryInterval: number;
    positionUpdateIntervals: number[];
    staticUpdateIntervals: number[];
    updateIntervalIndexPath: string;
}
interface Statistics {
    started: number | undefined;
    totalBytesTransmitted: number;
    position: ReportStatistics;
    static: ReportStatistics;
}
interface ReportStatistics {
    self: {
        totalReports: number;
        totalBytes: number;
    };
    others: {
        totalReports: number;
        totalBytes: number;
    };
}
export {};
