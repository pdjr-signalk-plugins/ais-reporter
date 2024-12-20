"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Endpoint = void 0;
class Endpoint {
    constructor(option, options, defaults) {
        this.name = '';
        this.ipAddress = '';
        this.port = 0;
        this.myVessel = {};
        this.otherVessels = {};
        this.statistics = {};
        if (!option.ipAddress)
            throw new Error('missing \'ipAddress\' property');
        if (!option.port)
            throw new Error('missing \'port\' property');
        this.name = options.name || option.ipAddress;
        this.ipAddress = option.ipAddress;
        this.port = option.port;
        this.myVessel = {};
        this.myVessel.expiryInterval = getOption([(option.myVessel || {}), option, (options.myVessel || {}), options], 'expiryInterval', defaults.EXPIRY_INTERVAL);
        this.myVessel.positionUpdateIntervals = getOptionArray([(option.myVessel || {}), option, (options.myVessel || {}), options], 'positionUpdateInterval', [defaults.POSITION_UPDATE_INTERVAL]);
        this.myVessel.staticUpdateIntervals = getOptionArray([(option.myVessel || {}), option, (options.myVessel || {}), , options], 'staticUpdateInterval', [defaults.STATIC_DATA_UPDATE_INTERVAL]);
        this.myVessel.updateIntervalIndexPath = getOption([(option.myVessel || {}), option, (options.myVessel || {}), options], 'updateIntervalIndexPath', undefined);
        this.otherVessels = {};
        this.otherVessels.expiryInterval = getOption([(option.otherVessels || {}), option, (options.otherVessels || {}), options], 'expiryInterval', defaults.EXPIRY_INTERVAL);
        this.otherVessels.positionUpdateIntervals = getOptionArray([(option.otherVessels || {}), option, (options.otherVessels || {}), options], 'positionUpdateInterval', [defaults.POSITION_UPDATE_INTERVAL]);
        this.otherVessels.staticUpdateIntervals = getOptionArray([(option.otherVessels || {}), option, (options.otherVessels || {}), options], 'staticUpdateInterval', [defaults.STATIC_DATA_UPDATE_INTERVAL]);
        this.otherVessels.updateIntervalIndexPath = getOption([(option.otherVessels || {}), option, (options.otherVessels || {}), options], 'updateIntervalIndexPath', undefined);
        this.statistics = {};
        this.statistics.started = Date.now();
        this.statistics.totalBytesTransmitted = 0;
        this.statistics.position.self = { totalReports: 0, totalBytes: 0 };
        this.statistics.position.others = { totalReports: 0, totalBytes: 0 };
        this.statistics.static.self = { totalReports: 0, totalBytes: 0 };
        this.statistics.static.others = { totalReports: 0, totalBytes: 0 };
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
}
exports.Endpoint = Endpoint;
