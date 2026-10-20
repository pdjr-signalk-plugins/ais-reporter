"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Endpoint = void 0;
class Endpoint {
    constructor(options, app) {
        this.app = undefined;
        /**
         * Name of the Endpoint, used only for reporting.
         */
        this.name = '';
        /**
         * IP address of the remote endpoint.
         */
        this.ipAddress = '';
        /**
         * Port number of the remote endpoint.
         */
        this.port = 0;
        /**
         * Whether or not the Endpoint is active.
         */
        this.enabled = true;
        /**
         * Configured intervals and related properties.
         */
        this.intervals = {};
        /**
         * Accumulated transmission statistics.
         */
        this.statistics = {};
        if (!options[0].ipAddress)
            throw new Error('missing \'ipAddress\' property');
        if (!options[0].port)
            throw new Error('missing \'port\' property');
        this.app = app;
        this.name = options[0].name || options[0].ipAddress;
        this.ipAddress = options[0].ipAddress;
        this.port = options[0].port;
        this.intervals.positionUpdateIntervals = getOptionArray(options, 'positionUpdateInterval');
        this.intervals.staticUpdateIntervals = getOptionArray(options, 'staticUpdateInterval');
        this.intervals.myPositionUpdateIntervals = getOptionArray(options, 'myPositionUpdateInterval');
        this.intervals.myStaticUpdateIntervals = getOptionArray(options, 'myStaticUpdateInterval');
        this.intervals.navigationStateMap = getOption(options, 'navigationStateMap');
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
        function getOption(options, name) {
            var retval = undefined;
            options.reverse().forEach((opt) => {
                if (opt.hasOwnProperty(name))
                    retval = opt[name];
            });
            return (retval);
        }
        function getOptionArray(options, name) {
            var retval = undefined;
            options.reverse().forEach((opt) => {
                if (opt.hasOwnProperty(name))
                    retval = (Array.isArray(opt[name])) ? opt[name] : [opt[name]];
            });
            return (retval);
        }
    }
    dump() {
        this.app.debug(`name: ${this.name}`);
        this.app.debug(`ipAddress: ${this.ipAddress}`);
        this.app.debug(`port: ${this.port}`);
        this.app.debug(`intervals: ${JSON.stringify(this.intervals)}`);
        this.app.debug(`statistics: ${JSON.stringify(this.statistics)}`);
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
