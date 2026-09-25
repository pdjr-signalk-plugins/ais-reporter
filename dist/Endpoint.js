"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Endpoint = void 0;
class Endpoint {
    constructor(option, options, defaults) {
        this.name = '';
        this.ipAddress = '';
        this.port = 0;
        this.intervals = {};
        this.statistics = {};
        if (!option.ipAddress)
            throw new Error('missing \'ipAddress\' property');
        if (!option.port)
            throw new Error('missing \'port\' property');
        this.name = option.name || option.ipAddress;
        this.ipAddress = option.ipAddress;
        this.port = option.port;
        this.intervals.expiryInterval = getOption([option, options], 'expiryInterval', defaults.EXPIRY_INTERVAL);
        this.intervals.positionUpdateIntervals = getOptionArray([option, options], 'positionUpdateInterval', [defaults.POSITION_UPDATE_INTERVAL]);
        this.intervals.staticUpdateIntervals = getOptionArray([option, options], 'staticUpdateInterval', [defaults.STATIC_DATA_UPDATE_INTERVAL]);
        this.intervals.myPositionUpdateIntervals = getOptionArray([option, options], 'myPositionUpdateInterval', [defaults.POSITION_UPDATE_INTERVAL]);
        this.intervals.myStaticUpdateIntervals = getOptionArray([option, options], 'myStaticUpdateInterval', [defaults.STATIC_DATA_UPDATE_INTERVAL]);
        this.intervals.updateIntervalIndexPath = getOption([option, options], 'updateIntervalIndexPath', undefined);
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
        function getOption(objects, name, fallback) {
            if (objects.length == 0) {
                return (fallback);
            }
            else {
                if (objects[0][name] !== undefined) {
                    return (objects[0][name]);
                }
                else {
                    return (getOption(objects.slice(1), name, fallback));
                }
            }
        }
        function getOptionArray(objects, name, fallback) {
            if (objects.length == 0) {
                return (fallback);
            }
            else {
                if (objects[0][name] !== undefined) {
                    return ((Array.isArray(objects[0][name])) ? objects[0][name] : [objects[0][name]]);
                }
                else {
                    return (getOptionArray(objects.slice(1), name, fallback));
                }
            }
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
