"use strict";
/**
 * Copyright 2024 Paul Reeve <preeve@pdjr.eu>
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
const ggencoder_1 = require("ggencoder");
const dgram_1 = require("dgram");
const signalk_libpluginstatus_1 = require("signalk-libpluginstatus");
const PLUGIN_ID = 'ais-reporter';
const PLUGIN_NAME = 'pdjr-ais-reporter';
const PLUGIN_DESCRIPTION = 'Report AIS data to remote UDP services.';
const PLUGIN_SCHEMA = {
    "type": "object",
    "required": ["endpoints"],
    "properties": {
        "$ref": "#/definitions/options",
        "myVessel": { "$ref": "#/definitions/vessel" },
        "otherVessels": { "$ref": "#/definitions/vessel" },
        "endpoints": {
            "type": "array",
            "title": "UDP endpoints to report to",
            "items": {
                "type": "object",
                "required": ["ipaddress", "port"],
                "properties": {
                    "name": {
                        "type": "string",
                        "title": "Endpoint name"
                    },
                    "ipaddress": {
                        "type": "string",
                        "title": "UDP endpoint IP address",
                        "format": "ipv4"
                    },
                    "port": {
                        "type": "number",
                        "title": "Port",
                        "minimum": 0
                    },
                    "$ref": "#/definitions/options",
                    "myVessel": { "$ref": "#/definitions/vessel" },
                    "otherVessels": { "$ref": "#/definitions/vessel" }
                }
            }
        }
    },
    "definitions": {
        "updateInterval": {
            "oneOf": [
                { "$ref": "#/$defs/interval" },
                { "type": "array", "items": { "$ref": "#/$defs/interval" } }
            ]
        },
        "interval": {
            "type": "integer",
            "minimum": 0
        },
        "options": {
            "expiryinterval": {
                "title": "Ignore vessel data older than (s)",
                "$ref": "#/definitions/interval"
            },
            "positionUpdateInterval": {
                "title": "Position update interval",
                "$ref": "#/definitions/updateInterval"
            },
            "staticUpdateInterval": {
                "title": "Static data update interval",
                "$ref": "#/definitions/updateInterval"
            },
            "overrideTriggerPath": {
                "title": "Path which selects override intervals",
                "type": "string"
            }
        },
        "vessel": {
            "$ref": "#/definitions/options"
        }
    }
};
const PLUGIN_UISCHEMA = {};
const DEFAULT_MY_AIS_CLASS = 'B';
const DEFAULT_POSITION_UPDATE_INTERVAL = 120;
const DEFAULT_STATIC_DATA_UPDATE_INTERVAL = 600;
const DEFAULT_EXPIRY_INTERVAL = 900;
const DEFAULT_HEARTBEAT_INTERVAL = 60000;
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
                pluginConfiguration = makePluginConfiguration(options);
                app.debug(`using configuration: ${JSON.stringify(pluginConfiguration, null, 2)}`);
                if (pluginConfiguration.endpoints.length > 0) {
                    pluginStatus.setDefaultStatus(`Reporting to ${pluginConfiguration.endpoints.length} endpoint${(pluginConfiguration.endpoints.length == 1) ? '' : 's'} (${pluginConfiguration.endpoints.map((e) => ('\'' + e.name + '\'')).join(', ')})`);
                    heartbeatInterval = startReporting(pluginConfiguration, udpSocket = (0, dgram_1.createSocket)('udp4'));
                }
                else {
                    pluginStatus.setDefaultStatus('Stopped: no configured endpoints');
                }
            }
            catch (e) {
                pluginStatus.setDefaultStatus('Stopped: configuration error');
                app.setPluginError(e.message);
            }
        },
        stop: function () {
            clearInterval(heartbeatInterval);
            udpSocket.close();
        },
        registerWithRouter: function (router) {
            router.get('/status', handleRoutes);
        },
        getOpenApi: function () {
            return (require('./openApi.json'));
        }
    };
    function makePluginConfiguration(options) {
        app.debug(`makePluginConfiguration()...`);
        let pluginConfiguration = {
            myMMSI: app.getSelfPath('mmsi'),
            myAisClass: app.getSelfPath('sensors.ais.class.value') || DEFAULT_MY_AIS_CLASS,
            endpoints: []
        };
        options.endpoints.forEach((option) => {
            if (!option.ipAddress)
                throw new Error('endpoint has missing \'ipAddress\' property');
            if (!option.port)
                throw new Error('endpoint has missing \'port\' property');
            let endpoint = {};
            endpoint.name = option.name || option.ipAddress;
            endpoint.ipAddress = option.ipAddress;
            endpoint.port = option.port;
            endpoint.myVessel = {};
            endpoint.myVessel.expiryInterval = getOption([(option.myVessel || {}), option, (options.myVessel || {}), options], 'expiryInterval', DEFAULT_EXPIRY_INTERVAL);
            endpoint.myVessel.positionUpdateIntervals = getOptionArray([(option.myVessel || {}), option, (options.myVessel || {}), options], 'positionUpdateInterval', [DEFAULT_POSITION_UPDATE_INTERVAL]);
            endpoint.myVessel.staticUpdateIntervals = getOptionArray([(option.myVessel || {}), option, (options.myVessel || {}), , options], 'staticUpdateInterval', [DEFAULT_STATIC_DATA_UPDATE_INTERVAL]);
            endpoint.myVessel.overrideTriggerPath = getOption([(option.myVessel || {}), option, (options.myVessel || {}), options], 'overrideTriggerPath', undefined);
            endpoint.otherVessels = {};
            endpoint.otherVessels.expiryInterval = getOption([(option.otherVessels || {}), option, (options.otherVessels || {}), options], 'expiryInterval', DEFAULT_EXPIRY_INTERVAL);
            endpoint.otherVessels.positionUpdateIntervals = getOptionArray([(option.otherVessels || {}), option, (options.otherVessels || {}), options], 'positionUpdateInterval', [DEFAULT_POSITION_UPDATE_INTERVAL]);
            endpoint.otherVessels.staticUpdateIntervals = getOptionArray([(option.otherVessels || {}), option, (options.otherVessels || {}), options], 'staticUpdateInterval', [DEFAULT_STATIC_DATA_UPDATE_INTERVAL]);
            endpoint.otherVessels.overrideTriggerPath = getOption([(option.otherVessels || {}), option, (options.otherVessels || {}), options], 'overrideTriggerPath', undefined);
            endpoint.statistics = {
                lastReportTimestamp: undefined,
                hour: new Array(60).fill(0),
                day: new Array(24).fill(0),
                position: { myVesselTotalReports: 0, myVesselTotalBytes: 0, otherVesselsTotalReports: 0, otherVesselsTotalBytes: 0 },
                static: { myVesselTotalReports: 0, myVesselTotalBytes: 0, otherVesselsTotalReports: 0, otherVesselsTotalBytes: 0 }
            };
            pluginConfiguration.endpoints.push(endpoint);
        });
        return (pluginConfiguration);
        function getOption(objects, name, fallback) {
            objects.forEach((object) => {
                app.debug(`checking object ${JSON.stringify(object)} for ${name}`);
                if (object.name)
                    return (object.name);
            });
            return (fallback);
        }
        function getOptionArray(objects, name, fallback) {
            objects.forEach((object) => {
                app.debug(`checking object ${JSON.stringify(object)} for ${name}`);
                if (object.name)
                    return ((Array.isArray(object.name)) ? object.name : [object.name]);
            });
            return (fallback);
        }
    }
    function startReporting(pluginConfiguration, udpSocket) {
        return (setInterval(() => {
            app.debug(`checking report requirement (heartbeat ${heartbeatCount})`);
            pluginConfiguration.endpoints.forEach((endpoint) => {
                try {
                    var reportStatistics = {};
                    var totalBytes = 0;
                    let mvIDX = ((endpoint.myVessel.overrideTriggerPath) ? (app.getSelfPath(endpoint.myVessel.overrideTriggerPath) || 0) : 0) ? 1 : 0;
                    let ovIDX = ((endpoint.otherVessels.overrideTriggerPath) ? (app.getSelfPath(endpoint.otherVessels.overrideTriggerPath) || 0) : 0) ? 1 : 0;
                    let mvPUI = (inRange(mvIDX, 0, endpoint.myVessel.positionUpdateIntervals.length)) ? endpoint.myVessel.positionUpdateIntervals[mvIDX] : 0;
                    let mvSUI = (inRange(mvIDX, 0, endpoint.myVessel.staticUpdateIntervals.length)) ? endpoint.myVessel.staticUpdateIntervals[mvIDX] : 0;
                    let ovPUI = (inRange(ovIDX, 0, endpoint.otherVessels.positionUpdateIntervals.length)) ? endpoint.otherVessels.positionUpdateIntervals[ovIDX] : 0;
                    let ovSUI = (inRange(ovIDX, 0, endpoint.otherVessels.staticUpdateIntervals.length)) ? endpoint.otherVessels.staticUpdateIntervals[ovIDX] : 0;
                    if (((mvPUI !== undefined) && (mvPUI !== 0) && (heartbeatCount % mvPUI) === 0) || ((ovPUI !== undefined) && (ovPUI !== 0) && (heartbeatCount % ovPUI) === 0)) {
                        pluginStatus.setStatus(`sending position report to endpoint '${endpoint.name}'`);
                        reportStatistics = reportPosition(udpSocket, endpoint, (mvPUI === undefined) ? false : ((mvPUI === 0) ? false : ((heartbeatCount % mvPUI) === 0)), (ovPUI === undefined) ? false : ((ovPUI === 0) ? false : ((heartbeatCount % ovPUI) === 0)));
                        updateReportStatistics(endpoint.statistics.position, reportStatistics);
                        totalBytes = (reportStatistics.myVessel.bytes + reportStatistics.otherVessels.bytes);
                    }
                    ;
                    if (((mvSUI !== undefined) && (mvSUI !== 0) && (heartbeatCount % mvSUI) === 0) || ((ovSUI !== undefined) && (ovSUI !== 0) && (heartbeatCount % ovSUI) === 0)) {
                        pluginStatus.setStatus(`sending static data report to endpoint '${endpoint.name}'`);
                        reportStatistics = reportStatic(udpSocket, endpoint, (mvSUI === undefined) ? false : ((mvSUI === 0) ? false : ((heartbeatCount % mvSUI) === 0)), (ovSUI === undefined) ? false : ((ovSUI === 0) ? false : ((heartbeatCount % ovSUI) === 0)));
                        updateReportStatistics(endpoint.statistics.static, reportStatistics);
                        totalBytes += (reportStatistics.myVessel.bytes + reportStatistics.otherVessels.bytes);
                    }
                    endpoint.statistics.lastReportTimestamp = Date.now();
                    updateByteVectors(endpoint.statistics, totalBytes, heartbeatCount);
                }
                catch (e) {
                    app.debug(`${e.message}`);
                }
            });
            heartbeatCount++;
        }, DEFAULT_HEARTBEAT_INTERVAL));
        function updateReportStatistics(endpointReportStatistics, reportStatistics) {
            endpointReportStatistics.myVesselTotalReports += reportStatistics.myVessel.count;
            endpointReportStatistics.myVesselTotalBytes += reportStatistics.myVessel.bytes;
            endpointReportStatistics.otherVesselsTotalReports += reportStatistics.otherVessels.count;
            endpointReportStatistics.otherVesselsTotalBytes += reportStatistics.otherVessels.bytes;
        }
        function updateByteVectors(endpointStatistics, bytes, heartbeat) {
            endpointStatistics.hour[0] += bytes;
            if ((heartbeat % 60) == 0)
                endpointStatistics.hour.slice(24).unshift(0);
            endpointStatistics.day[0] += bytes;
            if ((heartbeat % (1440)) == 0)
                endpointStatistics.day.slice(6).unshift(0);
        }
    }
    function reportPosition(socket, endpoint, reportSelf, reportOthers) {
        var reportStatistics = { myVessel: { count: 0, bytes: 0 }, otherVessels: { count: 0, bytes: 0 } };
        var aisClass;
        var aisProperties;
        var msg;
        var bytesTransmitted;
        Object.values(app.getPath('vessels'))
            .filter((vessel) => ((reportSelf && (vessel.mmsi == pluginConfiguration.myMMSI)) || (reportOthers && (vessel.mmsi != pluginConfiguration.myMMSI))))
            .filter((vessel) => (reportSelf && ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (endpoint.myVessel.expiryInterval * 60000)))) || (reportOthers && ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (endpoint.otherVessels.expiryInterval * 60000)))))
            .forEach((vessel) => {
            try {
                aisProperties = { mmsi: vessel.mmsi };
                aisClass = (vessel.mmsi == pluginConfiguration.myMMSI) ? pluginConfiguration.myAisClass : vessel.sensors.ais.class.value;
                aisProperties['accuracy'] = 0;
                aisProperties['aistype'] = (aisClass == 'A') ? 1 : 18;
                aisProperties['cog'] = radsToDeg(vessel.navigation.courseOverGroundTrue.value);
                try {
                    aisProperties['hdg'] = vessel.navigation.headingTrue.value;
                }
                catch (e) {
                    aisProperties['hdg'] = 511;
                }
                aisProperties['lat'] = vessel.navigation.position.value.latitude;
                aisProperties['lon'] = vessel.navigation.position.value.longitude;
                aisProperties['own'] = (pluginConfiguration.myMMSI == vessel.mmsi) ? 1 : 0;
                aisProperties['repeat'] = 3;
                try {
                    aisProperties['rot'] = vessel.navigation.rateOfTurn.value;
                }
                catch (e) {
                    aisProperties['rot'] = 128;
                }
                aisProperties['sog'] = mpsToKn(vessel.navigation.speedOverGround.value);
                try {
                    aisProperties['smi'] = decodeSMI(vessel.navigation.specialManeuver);
                }
                catch (e) {
                    aisProperties['smi'] = 0;
                }
                msg = new ggencoder_1.AisEncode(aisProperties);
                if ((msg) && (msg.valid())) {
                    bytesTransmitted = sendReportMsg(socket, msg.nmea, endpoint);
                    if ((reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI)) { // reporting self
                        reportStatistics.myVessel.count++;
                        reportStatistics.myVessel.bytes += bytesTransmitted;
                    }
                    else {
                        reportStatistics.otherVessels.count++;
                        reportStatistics.otherVessels.bytes += bytesTransmitted;
                    }
                }
                else
                    throw new Error('AIS encode failed');
            }
            catch (e) {
                app.debug(`error creating AIS sentence for vessel '${vessel.mmsi}' (${e.message})`);
            }
        });
        return (reportStatistics);
    }
    function reportStatic(socket, endpoint, reportSelf = false, reportOthers = false) {
        var reportStatistics = { myVessel: { count: 0, bytes: 0 }, otherVessels: { count: 0, bytes: 0 } };
        var aisClass;
        var aisProperties;
        var msg, msgB;
        var bytesTransmitted;
        Object.values(app.getPath('vessels'))
            .filter((vessel) => ((reportSelf && (vessel.mmsi == pluginConfiguration.myMMSI)) || (reportOthers && (vessel.mmsi != pluginConfiguration.myMMSI))))
            .filter((vessel) => (reportSelf && ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (endpoint.myVessel.expiryInterval * 60000)))) || (reportOthers && ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (endpoint.otherVessels.expiryInterval * 60000)))))
            .forEach((vessel) => {
            try {
                aisProperties = { mmsi: vessel.mmsi };
                aisClass = (vessel.mmsi == pluginConfiguration.myMMSI) ? pluginConfiguration.myAisClass : vessel.sensors.ais.class.value;
                aisProperties['callsign'] = '';
                try {
                    aisProperties['cargo'] = vessel.design.aisShipType.value.id;
                }
                catch (e) {
                    aisProperties['cargo'] = 0;
                }
                try {
                    aisProperties['destination'] = vessel.navigation.destination.commonName;
                }
                catch (e) {
                    aisProperties['destination'] = '';
                }
                try {
                    aisProperties['dimA'] = vessel.sensors.ais.fromBow.value.toFixed(0);
                }
                catch (e) {
                    aisProperties['dimA'] = 0;
                }
                try {
                    aisProperties['dimB'] = (vessel.design.length.value.overall - vessel.sensors.gps.fromBow.value).toFixed(0);
                }
                catch (e) {
                    aisProperties['dimB'] = 0;
                }
                try {
                    aisProperties['dimC'] = (vessel.design.beam.value / 2 + vessel.sensors.gps.fromCenter.value).toFixed(0);
                }
                catch (e) {
                    aisProperties['dimC'] = 0;
                }
                try {
                    aisProperties['dimD'] = (vessel.design.beam.value / 2 - vessel.sensors.gps.fromCenter.value).toFixed(0);
                }
                catch (e) {
                    aisProperties['dimD'] = 0;
                }
                try {
                    aisProperties['draught'] = vessel.design.draft.value.maximum;
                }
                catch (e) {
                    aisProperties['draught'] = 0;
                }
                aisProperties['etaDay'] = 0;
                aisProperties['etaHr'] = 0;
                aisProperties['etaMin'] = 0;
                aisProperties['etaMo'] = 0;
                aisProperties['imo'] = '';
                aisProperties['repeat'] = 3;
                try {
                    aisProperties['shipname'] = vessel.name;
                }
                catch (e) {
                    aisProperties['shipname'] = '';
                }
                switch (aisClass) {
                    case 'A':
                        aisProperties['aistype'] = 5;
                        msg = new ggencoder_1.AisEncode(aisProperties);
                        if ((msg) && (msg.valid)) {
                            bytesTransmitted = sendReportMsg(socket, msg.nmea, endpoint);
                            if ((reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI)) {
                                reportStatistics.myVessel.count++;
                                reportStatistics.myVessel.bytes += bytesTransmitted;
                            }
                            else {
                                reportStatistics.otherVessels.count++;
                                reportStatistics.otherVessels.bytes += bytesTransmitted;
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
                                    reportStatistics.myVessel.count++;
                                    reportStatistics.myVessel.bytes += bytesTransmitted;
                                }
                                else {
                                    reportStatistics.otherVessels.count++;
                                    reportStatistics.otherVessels.bytes += bytesTransmitted;
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
                app.debug(`error creating AIS sentence for '${vessel.mmsi}' (${e.message})`);
            }
        });
        return (reportStatistics);
    }
    function sendReportMsg(socket, msg, endpoint) {
        app.debug(`sending report to endpoint '${endpoint.name}'`);
        var retval = 0;
        if (socket) {
            retval = (msg.length + 1);
            socket.send(msg + '\n', 0, msg.length + 1, endpoint.port, endpoint.ipAddress, (e) => {
                if (e instanceof Error)
                    app.setPluginStatus(`send failure (${e.message})`);
            });
        }
        else {
            app.setPluginStatus(`Stopped: UDP port is no longer available`);
        }
        return (retval);
    }
    function inRange(x, min, max) {
        return (((x - min) * (x - max)) <= 0);
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
        app.debug("processing %s request on %s", req.method, req.path);
        try {
            switch (req.path.slice(0, (req.path.indexOf('/', 1) == -1) ? undefined : req.path.indexOf('/', 1))) {
                case '/status':
                    const status = (pluginConfiguration.endpoints || []).reduce((a, endpoint) => {
                        a[endpoint.name] = {
                            ipAddress: endpoint.ipAddress,
                            port: endpoint.port,
                            statistics: endpoint.statistics
                        };
                        return (a);
                    }, {});
                    expressSend(res, 200, status, req.path);
                    break;
            }
        }
        catch (e) {
            app.debug(e.message);
            expressSend(res, ((/^\d+$/.test(e.message)) ? parseInt(e.message) : 500), null, req.path);
        }
        function expressSend(res, code, body, debugPrefix = null) {
            const FETCH_RESPONSES = { "200": null, "201": null, "400": "bad request", "403": "forbidden", "404": "not found", "503": "service unavailable (try again later)", "500": "internal server error" };
            res.status(code).send((body) ? body : ((FETCH_RESPONSES['' + code]) ? FETCH_RESPONSES['' + code] : null));
            if (debugPrefix)
                app.debug("%s: %d %s", debugPrefix, code, ((body) ? JSON.stringify(body) : ((FETCH_RESPONSES['' + code]) ? FETCH_RESPONSES['' + code] : null)));
            return (false);
        }
    }
    return (plugin);
};
