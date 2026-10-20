"use strict";
/**
 * Copyright 2024-2026 Paul Reeve <preeve@pdjr.eu>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("lodash");
const Endpoint_1 = require("./Endpoint");
const ggencoder_1 = require("ggencoder");
const dgram_1 = require("dgram");
const signalk_libpluginstatus_1 = require("signalk-libpluginstatus");
const DEFAULT_MY_AIS_CLASS = 'B';
const DEFAULT_ENDPOINT_OPTIONS = { POSITION_UPDATE_INTERVAL: 0, STATIC_UPDATE_INTERVAL: 0 };
const HEARTBEAT_INTERVAL = 60000;
const PLUGIN_ID = 'ais-reporter';
const PLUGIN_NAME = 'ais-reporter';
const PLUGIN_DESCRIPTION = 'Report AIS data to remote UDP services.';
const PLUGIN_SCHEMA = {
    "type": "object",
    "required": ["endpoints"],
    "properties": {
        "positionUpdateInterval": {
            "title": "Position update interval in minutes",
            "oneOf": [
                { "type": "integer", "minimum": 0 },
                { "type": "array", "items": { "type": "integer", "minimum": 0 } }
            ]
        },
        "staticUpdateInterval": {
            "title": "Static data update interval in minutes",
            "oneOf": [
                { "type": "integer", "minimum": 0 },
                { "type": "array", "items": { "type": "integer", "minimum": 0 } }
            ]
        },
        "myPositionUpdateInterval": {
            "title": "Position update interval in minutes",
            "oneOf": [
                { "type": "integer", "minimum": 0 },
                { "type": "array", "items": { "type": "integer", "minimum": 0 } }
            ]
        },
        "myStaticUpdateInterval": {
            "title": "Static data update interval in minutes",
            "oneOf": [
                { "type": "integer", "minimum": 0 },
                { "type": "array", "items": { "type": "integer", "minimum": 0 } }
            ]
        },
        "navigationStateMap": {
            "title": "Select different intervals based upon navigation state",
            "type": "array",
            "items": {
                "type": "array",
                "items": {
                    "type": "string",
                }
            }
        },
        "endpoints": {
            "type": "array",
            "title": "UDP endpoints to report to",
            "items": {
                "type": "object",
                "required": ["ipaddress", "port"],
                "properties": {
                    "name": {
                        "title": "Endpoint name",
                        "type": "string"
                    },
                    "ipaddress": {
                        "title": "Endpoint IP address",
                        "type": "string",
                        "format": "ipv4"
                    },
                    "port": {
                        "title": "Endpoint port number",
                        "type": "number",
                        "minimum": 0
                    },
                    "positionUpdateInterval": {
                        "title": "Position update interval in minutes",
                        "oneOf": [
                            { "type": "integer", "minimum": 0 },
                            { "type": "array", "items": { "type": "integer", "minimum": 0 } }
                        ]
                    },
                    "staticUpdateInterval": {
                        "title": "Static data update interval in minutes",
                        "oneOf": [
                            { "type": "integer", "minimum": 0 },
                            { "type": "array", "items": { "type": "integer", "minimum": 0 } }
                        ]
                    },
                    "myPositionUpdateInterval": {
                        "title": "Position update interval in minutes",
                        "oneOf": [
                            { "type": "integer", "minimum": 0 },
                            { "type": "array", "items": { "type": "integer", "minimum": 0 } }
                        ]
                    },
                    "myStaticUpdateInterval": {
                        "title": "Static data update interval in minutes",
                        "oneOf": [
                            { "type": "integer", "minimum": 0 },
                            { "type": "array", "items": { "type": "integer", "minimum": 0 } }
                        ]
                    },
                    "updateIntervalIndexPath": {
                        "title": "Path which selects override intervals",
                        "type": "string"
                    }
                }
            }
        }
    }
};
const PLUGIN_UISCHEMA = {};
module.exports = function (app) {
    var pluginConfiguration;
    var pluginStatus;
    var udpSocket;
    var heartbeatInterval;
    var heartbeatCount = 0;
    const plugin = {
        id: PLUGIN_ID,
        name: PLUGIN_NAME,
        description: PLUGIN_DESCRIPTION,
        schema: PLUGIN_SCHEMA,
        uiSchema: PLUGIN_UISCHEMA,
        start: function (options) {
            pluginStatus = new signalk_libpluginstatus_1.PluginStatus(app, 'started');
            try {
                pluginConfiguration = makePluginConfiguration(options, DEFAULT_ENDPOINT_OPTIONS);
                if (pluginConfiguration.endpoints.length > 0) {
                    pluginConfiguration.endpoints.forEach((endpoint) => { app.debug(`created endpoint '${endpoint.name}`); });
                    pluginStatus.setDefaultStatus(`Reporting to ${pluginConfiguration.endpoints.length} endpoint${(pluginConfiguration.endpoints.length == 1) ? '' : 's'}`);
                    heartbeatInterval = startReporting(pluginConfiguration, udpSocket = (0, dgram_1.createSocket)('udp4'), HEARTBEAT_INTERVAL);
                }
                else {
                    pluginStatus.setDefaultStatus('Stopped: no configured endpoints');
                }
            }
            catch (e) {
                pluginStatus.setDefaultStatus('Stopped: configuration error');
                app.debug(`${e.lineNumber}: ${e.message}`);
            }
        },
        stop: function () {
            clearInterval(heartbeatInterval);
            udpSocket.close();
        },
        registerWithRouter: function (router) {
            router.get('/status', handleRoutes);
            router.get('/stop', handleRoutes);
            router.get('/start', handleRoutes);
        },
        getOpenApi: function () {
            return (require('./openApi.json'));
        }
    };
    /**
     * Create a canonical plugin configuration from the user-supplied
     * JSON configuration. Global and default properties are consolidated
     * so that all properties reside within endpoint object definitions.
     *
     * Fatal errors cause an exception.
     *
     * @param options - contenf of JSON configuration file.
     * @returns - a canonical PluginConfiguration.
     */
    function makePluginConfiguration(options, defaults) {
        var retval = {
            myMMSI: app.getSelfPath('mmsi'),
            myAisClass: app.getSelfPath('sensors.ais.class.value') || DEFAULT_MY_AIS_CLASS,
            endpoints: options.endpoints.map((option) => new Endpoint_1.Endpoint([option, options, defaults], app))
        };
        return (retval);
    }
    /**
     * Creates a timer and associated calback function which is executed
     * once per minute and manages the entire reporting process by
     * raising position and static reports for all endpoints at the
     * intervals specified in pluginConfiguration and recording resources
     * consumed by the activity of each endpoint.
     *
     * @param pluginConfiguration - a canonical PluginConfiguration.
     * @param udpSocket - open Socket to be used for reporting over UDP.
     * @returns - NodeJS.timeout handle of the timer control.
     */
    function startReporting(pluginConfiguration, udpSocket, heartbeat) {
        return (setInterval(() => {
            pluginConfiguration.endpoints.forEach((endpoint) => {
                try {
                    var reportStatistics = {};
                    var totalBytes = 0;
                    let updateIndex = getUpdateIndex(endpoint.intervals.navigationStateMap);
                    let mvPUI = _.get(endpoint.intervals, `myPositionUpdateIntervals[${updateIndex}]`, 0);
                    let mvSUI = _.get(endpoint.intervals, `myStaticUpdateIntervals[${updateIndex}]`, 0);
                    let ovPUI = _.get(endpoint.intervals, `positionUpdateIntervals[${updateIndex}]`, 0);
                    let ovSUI = _.get(endpoint.intervals, `staticUpdateIntervals[${updateIndex}]`, 0);
                    if (((mvPUI !== 0) && ((heartbeatCount % mvPUI) === 0)) || ((ovPUI !== 0) && ((heartbeatCount % ovPUI) === 0))) {
                        pluginStatus.setStatus(`sending position report to endpoint '${endpoint.name}'`);
                        reportStatistics = reportPosition(udpSocket, endpoint, (mvPUI === 0) ? false : ((heartbeatCount % mvPUI) === 0), (ovPUI === 0) ? false : ((heartbeatCount % ovPUI) === 0));
                        endpoint.updateStatistics('position', reportStatistics);
                    }
                    ;
                    if (((mvSUI !== 0) && ((heartbeatCount % mvSUI) === 0)) || ((ovSUI !== 0) && ((heartbeatCount % ovSUI) === 0))) {
                        pluginStatus.setStatus(`sending static data report to endpoint '${endpoint.name}'`);
                        reportStatistics = reportStatic(udpSocket, endpoint, (mvSUI === 0) ? false : ((heartbeatCount % mvSUI) === 0), (ovSUI === 0) ? false : ((heartbeatCount % ovSUI) === 0));
                        endpoint.updateStatistics('static', reportStatistics);
                    }
                }
                catch (e) {
                    app.debug(`${e.message}`);
                }
            });
            heartbeatCount++;
        }, heartbeat));
        /**
         * Uses a supplied stateMap to translate the current 'self'
         * 'navigation.state' into a numeric array index.
         * @param stateMap
         * @returns
         */
        function getUpdateIndex(stateMap) {
            var retval = 0;
            var navigationState = app.getSelfPath(`navigation.state.value`);
            if (navigationState) {
                for (var index = 0; index < stateMap.length; index++) {
                    if (stateMap[index].includes(navigationState))
                        retval = index;
                }
            }
            return (retval);
        }
    }
    /**
     * Generate one or more AIS position reports for transmission to a
     * specified endpoint and forward these reports for UDP output.
     *
     * @param socket - Socket to be used for report transmission.
     * @param endpoint - Endpoint to be processed.
     * @param reportSelf - true to report 'self' vessel.
     * @param reportOthers - true to report vessels other than 'self'.
     * @returns - ReportStatistics for the transmission.
     */
    function reportPosition(socket, endpoint, reportSelf, reportOthers) {
        var reportStatistics = { self: { reports: 0, bytes: 0 }, others: { reports: 0, bytes: 0 } };
        var aisClass;
        var aisProperties;
        var msg;
        var bytesTransmitted;
        Object.values(app.getPath('vessels'))
            .filter((vessel) => ((reportSelf && (vessel.mmsi == pluginConfiguration.myMMSI)) || (reportOthers && (vessel.mmsi != pluginConfiguration.myMMSI))))
            .filter((vessel) => (reportSelf && (_.get(vessel, 'navigation.position.timestamp', false)) || (reportOthers && (_.get(vessel, 'navigation.position.timestamp', false)))))
            .forEach((vessel) => {
            try {
                aisProperties = { mmsi: vessel.mmsi };
                aisClass = (vessel.mmsi == pluginConfiguration.myMMSI) ? pluginConfiguration.myAisClass : _.get(vessel, 'sensors.ais.class.value', DEFAULT_MY_AIS_CLASS);
                aisProperties['accuracy'] = 0;
                aisProperties['aistype'] = (aisClass == 'A') ? 1 : 18;
                aisProperties['cog'] = radsToDeg(_.get(vessel, 'navigation.courseOverGroundTrue.value', 0));
                aisProperties['hdg'] = _.get(vessel, 'navigation.headingTrue.value', 511);
                aisProperties['lat'] = vessel.navigation.position.value.latitude;
                aisProperties['lon'] = vessel.navigation.position.value.longitude;
                aisProperties['own'] = (pluginConfiguration.myMMSI == vessel.mmsi) ? 1 : 0;
                aisProperties['repeat'] = 3;
                aisProperties['rot'] = _.get(vessel, 'navigation.rateOfTurn.value', 128);
                aisProperties['sog'] = mpsToKn(_.get(vessel, 'navigation.speedOverGround.value', 0));
                aisProperties['smi'] = decodeSMI(_.get(vessel, 'navigation.specialManeuver', 'not available'));
                msg = new ggencoder_1.AisEncode(aisProperties);
                if ((msg) && (msg.valid)) {
                    bytesTransmitted = sendReportMsg(socket, msg.nmea, endpoint);
                    if ((reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI)) { // reporting self
                        reportStatistics.self.reports++;
                        reportStatistics.self.bytes += bytesTransmitted;
                    }
                    else {
                        reportStatistics.others.reports++;
                        reportStatistics.others.bytes += bytesTransmitted;
                    }
                }
                else
                    throw new Error('AIS encode failed');
            }
            catch (e) {
                app.debug(`error sending AIS position report for vessel '${vessel.mmsi}' to endpoint '${endpoint.name}' (${e.message})`);
            }
        });
        return (reportStatistics);
    }
    /**
     * Generate one or more AIS static data reports for transmission to a
     * specified endpoint and forward these reports for UDP output.
     *
     * @param socket - Socket to be used for report transmission.
     * @param endpoint - Endpoint to be processed.
     * @param reportSelf - true to report 'self' vessel.
     * @param reportOthers - true to report vessels other than 'self'.
     * @returns - ReportStatistics for the transmission.
     */
    function reportStatic(socket, endpoint, reportSelf = false, reportOthers = false) {
        var reportStatistics = { self: { reports: 0, bytes: 0 }, others: { reports: 0, bytes: 0 } };
        var aisClass;
        var aisProperties;
        var msg, msgB;
        var bytesTransmitted;
        Object.values(app.getPath('vessels'))
            .filter((vessel) => ((reportSelf && (vessel.mmsi == pluginConfiguration.myMMSI)) || (reportOthers && (vessel.mmsi != pluginConfiguration.myMMSI))))
            .filter((vessel) => (reportSelf && (_.get(vessel, 'navigation.position.timestamp', false)) || (reportOthers && (_.get(vessel, 'navigation.position.timestamp', false)))))
            .forEach((vessel) => {
            try {
                aisProperties = { mmsi: vessel.mmsi };
                aisClass = (vessel.mmsi == pluginConfiguration.myMMSI) ? pluginConfiguration.myAisClass : _.get(vessel, 'sensors.ais.class.value', DEFAULT_MY_AIS_CLASS);
                aisProperties['callsign'] = '';
                aisProperties['cargo'] = _.get(vessel, 'design.aisShipType.value.id', 0);
                aisProperties['destination'] = _.get(vessel, 'navigation.destination.commonName', '');
                aisProperties['dimA'] = (_.get(vessel, 'sensors.ais.fromBow.value', 0)).toFixed(0);
                aisProperties['dimB'] = (_.get(vessel, 'design.length.value.overall', 0) - _.get(vessel, 'sensors.gps.fromBow.value', 0)).toFixed(0);
                aisProperties['dimC'] = (_.get(vessel, 'design.beam.value', 0) / 2 + _.get(vessel, 'sensors.gps.fromCenter.value', 0)).toFixed(0);
                aisProperties['dimD'] = (_.get(vessel, 'design.beam.value', 0) / 2 - _.get(vessel, 'sensors.gps.fromCenter.value', 0)).toFixed(0);
                aisProperties['draught'] = _.get(vessel, 'design.draft.value.maximum', 0);
                aisProperties['etaDay'] = 0;
                aisProperties['etaHr'] = 0;
                aisProperties['etaMin'] = 0;
                aisProperties['etaMo'] = 0;
                aisProperties['imo'] = '';
                aisProperties['repeat'] = 3;
                aisProperties['shipname'] = _.get(vessel, 'name', '');
                switch (aisClass) {
                    case 'A':
                        aisProperties['aistype'] = 5;
                        msg = new ggencoder_1.AisEncode(aisProperties);
                        if ((msg) && (msg.valid)) {
                            bytesTransmitted = sendReportMsg(socket, msg.nmea, endpoint);
                            if ((reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI)) {
                                reportStatistics.self.reports++;
                                reportStatistics.self.bytes += bytesTransmitted;
                            }
                            else {
                                reportStatistics.others.reports++;
                                reportStatistics.others.bytes += bytesTransmitted;
                            }
                        }
                        else
                            throw new Error('AIS encode failed');
                        break;
                    case 'B':
                        aisProperties['aistype'] = 24;
                        aisProperties['part'] = 0;
                        msg = new ggencoder_1.AisEncode(aisProperties);
                        if ((msg) && (msg.valid)) {
                            aisProperties['part'] = 1;
                            msgB = new ggencoder_1.AisEncode(aisProperties);
                            if ((msgB) && (msgB.valid)) {
                                bytesTransmitted = sendReportMsg(socket, msg.nmea, endpoint);
                                bytesTransmitted += sendReportMsg(socket, msgB.nmea, endpoint);
                                if ((reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI)) {
                                    reportStatistics.self.reports++;
                                    reportStatistics.self.bytes += bytesTransmitted;
                                }
                                else {
                                    reportStatistics.others.reports++;
                                    reportStatistics.others.bytes += bytesTransmitted;
                                }
                            }
                            else
                                throw new Error('AIS Part B encode failed');
                        }
                        else
                            throw new Error('AIS Part A encode failed');
                        break;
                    default:
                        break;
                }
            }
            catch (e) {
                app.debug(`error sending AIS static data report for vessel '${vessel.mmsi}' to endpoint '${endpoint.name}' (${e.message})`);
            }
        });
        return (reportStatistics);
    }
    /**
     * Transmits a message string over UDP.
     *
     * Throws an exception on transmission error.
     *
     * @param socket - Socket to be used for report transmission.
     * @param msg - message string to be transmitted.
     * @param endpoint - Endpoint specifying the transmission target.
     * @returns - number of bytes transmitted.
     */
    function sendReportMsg(socket, msg, endpoint) {
        var retval = 0;
        if (endpoint.enabled) {
            app.debug(`sending "${msg}" to '${endpoint.name}'`);
            socket.send(msg + '\n', 0, msg.length + 1, endpoint.port, endpoint.ipAddress, (e) => { });
            retval = (msg.length + 1);
        }
        return (retval);
    }
    function radsToDeg(radians) {
        return (radians * 180 / Math.PI);
    }
    function mpsToKn(mps) {
        return (1.9438444924574 * mps);
    }
    function decodeSMI(label) {
        switch (label) {
            case 'not available': return (0);
            case 'not engaged': return (1);
            case 'engaged': return (2);
            default: return (0);
        }
    }
    function handleRoutes(req, res) {
        app.debug(`handleRoutes(${req.method}, ${req.path})...`);
        var status;
        try {
            if (Object.keys(req.query).length != 0) {
                if (req.query.name === undefined)
                    throw new Error("400");
                if (!pluginConfiguration.endpoints.map((e) => e.name).includes(req.query.name))
                    throw new Error("404");
            }
            switch (req.path.slice(0, (req.path.indexOf('/', 1) == -1) ? undefined : req.path.indexOf('/', 1))) {
                case '/status':
                    var statusResponse = {};
                    pluginConfiguration.endpoints.forEach((endpoint) => {
                        let hours = (endpoint.statistics.started) ? (Date.now() - endpoint.statistics.started) / 3600000 : 1;
                        var status = {
                            name: endpoint.name,
                            ipAddress: endpoint.ipAddress,
                            port: endpoint.port,
                            started: (endpoint.statistics.started) ? (new Date(endpoint.statistics.started)).toISOString() : 'never',
                            totalBytesTransmitted: endpoint.statistics.totalBytes,
                            positionSelfBytesPerHour: Math.floor(endpoint.statistics.position.self.bytes / hours),
                            positionOthersBytesPerHour: Math.floor(endpoint.statistics.position.others.bytes / hours),
                            staticSelfBytesPerHour: Math.floor(endpoint.statistics.static.self.bytes / hours),
                            staticOthersBytesPerHour: Math.floor(endpoint.statistics.static.others.bytes / hours)
                        };
                        if ((Object.keys(req.query).length === 0)) {
                            statusResponse[endpoint.name] = status;
                        }
                        else if (req.query.name == endpoint.name) {
                            statusResponse = status;
                        }
                    });
                    expressSend(res, 200, statusResponse, req.path);
                    break;
                case "/start":
                    pluginConfiguration.endpoints.forEach((endpoint) => {
                        endpoint.enabled = (Object.keys(req.query).length === 0) ? true : ((endpoint.name == req.query.name) ? true : endpoint.enabled);
                    });
                    expressSend(res, 200, null, req.path);
                    break;
                case "/stop":
                    pluginConfiguration.endpoints.forEach((endpoint) => {
                        endpoint.enabled = (Object.keys(req.query).length === 0) ? false : ((endpoint.name == req.query.name) ? false : endpoint.enabled);
                    });
                    expressSend(res, 200, null, req.path);
                    break;
                default:
                    break;
            }
        }
        catch (e) {
            app.debug(e.message);
            expressSend(res, ((/^\d+$/.test(e.message)) ? parseInt(e.message) : 500), null, req.path);
        }
        function expressSend(res, code, body, debugPrefix = null) {
            app.debug(`expressSend(res, ${code}, ${JSON.stringify(body)}, ${debugPrefix})...`);
            const FETCH_RESPONSES = { "200": "Ok", "201": null, "400": "bad request", "403": "forbidden", "404": "not found", "503": "service unavailable (try again later)", "500": "internal server error" };
            res.status(code).send((body) ? body : ((FETCH_RESPONSES['' + code]) ? FETCH_RESPONSES['' + code] : null));
            return (false);
        }
    }
    return (plugin);
};
