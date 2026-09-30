"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Endpoint = void 0;
class Endpoint {
    constructor(endpointConfig, globalConfig, defaults) {
        this.name = '';
        this.ipAddress = '';
        this.port = 0;
        this.intervals = {};
        this.statistics = {};
        if (!endpointConfig.ipAddress)
            throw new Error('missing \'ipAddress\' property');
        if (!endpointConfig.port)
            throw new Error('missing \'port\' property');
        this.name = endpointConfig.name || endpointConfig.ipAddress;
        this.ipAddress = endpointConfig.ipAddress;
        this.port = endpointConfig.port;
        this.intervals.positionUpdateIntervals = getOptionArray(endpointConfig, globalConfig, 'positionUpdateInterval', [defaults.POSITION_UPDATE_INTERVAL]);
        this.intervals.staticUpdateIntervals = getOptionArray(endpointConfig, globalConfig, 'staticUpdateInterval', [defaults.STATIC_UPDATE_INTERVAL]);
        this.intervals.myPositionUpdateIntervals = getOptionArray(endpointConfig, globalConfig, 'myPositionUpdateInterval', [defaults.POSITION_UPDATE_INTERVAL]);
        this.intervals.myStaticUpdateIntervals = getOptionArray(endpointConfig, globalConfig, 'myStaticUpdateInterval', [defaults.STATIC_UPDATE_INTERVAL]);
        this.intervals.updateIntervalIndexPath = getOption(endpointConfig, globalConfig, 'updateIntervalIndexPath', undefined);
        this.statistics = {
            started: Date.now(),
            totalBytes: 0,
            position: {
                self: {
                    reports: 0,
                    bytes: 0
                },
                others: {
                    reports: 0,
                    bytes: 0
                }
            },
            static: {
                self: {
                    reports: 0,
                    bytes: 0
                },
                others: {
                    reports: 0,
                    bytes: 0
                }
            }
        };
        /**
         *
         * @param objects - an array of arbitrary objects which may contain 'name'
         * @param name - the identifier of a property that may be contained in 'objects'
         * @param fallback - the value to be returned if 'name' is not found in any object.
         * @returns
         */
        function getOption(endpointConfig, globalConfig, name, fallback) {
            var retval = fallback;
            if (globalConfig.hasOwnProperty(name))
                retval = globalConfig[name];
            if (endpointConfig.hasOwnProperty(name))
                retval = endpointConfig[name];
            return (retval);
        }
        function getOptionArray(endpointConfig, globalConfig, name, fallback) {
            var retval = fallback;
            if (globalConfig.hasOwnProperty(name))
                retval = (Array.isArray(globalConfig[name])) ? globalConfig[name] : [globalConfig[name]];
            if (endpointConfig.hasOwnProperty(name))
                retval = (Array.isArray(endpointConfig[name])) ? endpointConfig[name] : [endpointConfig[name]];
            return (retval);
        }
    }
    updateStatistics(reportType, update) {
        this.statistics.totalBytes += (update.self.bytes + update.others.bytes);
        switch (reportType) {
            case 'position':
                this.statistics.position.self.reports += update.self.reports;
                this.statistics.position.self.bytes += update.self.bytes;
                this.statistics.position.others.reports += update.others.reports;
                this.statistics.position.others.bytes += update.others.bytes;
                break;
            case 'static':
                this.statistics.static.self.reports += update.self.reports;
                this.statistics.static.self.bytes += update.self.bytes;
                this.statistics.static.others.reports += update.others.reports;
                this.statistics.static.others.bytes += update.others.bytes;
                break;
            default:
                break;
        }
    }
}
exports.Endpoint = Endpoint;
