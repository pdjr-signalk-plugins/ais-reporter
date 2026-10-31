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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const _ = __importStar(require("lodash"));
const Endpoint_1 = require("./Endpoint");
const ggencoder_1 = require("ggencoder");
const dgram_1 = require("dgram");
const signalk_libpluginstatus_1 = require("signalk-libpluginstatus");
const DEFAULT_MY_AIS_CLASS = 'B';
const DEFAULT_ENDPOINT_OPTIONS = { myAisReportClass: "B", positionUpdateInterval: 0, staticUpdateInterval: 0 };
const HEARTBEAT_INTERVAL = 60000;
const PLUGIN_ID = 'ais-reporter';
const PLUGIN_NAME = 'ais-reporter';
const PLUGIN_DESCRIPTION = 'Report AIS data to remote UDP services.';
const schema_json_1 = __importDefault(require("./schema.json"));
const uischema_json_1 = __importDefault(require("./uischema.json"));
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
        schema: schema_json_1.default,
        uiSchema: uischema_json_1.default,
        start: function (options) {
            pluginStatus = new signalk_libpluginstatus_1.PluginStatus(app, `started`);
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
                    var spbt = 0, ssbt = 0, tpbt = 0, tsbt = 0;
                    var myVessel = Object.values(app.getPath('vessels')).reduce((a, v) => ((v.mmsi.value == app.getSelfPath('mmsi').value) ? v : a), {});
                    console.log(`myVessel = ${myVessel.mmsi}`);
                    let updateIndex = getUpdateIndex(endpoint.intervals.navigationStateMap);
                    let mvPUI = _.get(endpoint.intervals, `myPositionUpdateIntervals[${updateIndex}]`, 0);
                    let mvSUI = _.get(endpoint.intervals, `myStaticUpdateIntervals[${updateIndex}]`, 0);
                    let ovPUI = _.get(endpoint.intervals, `positionUpdateIntervals[${updateIndex}]`, 0);
                    let ovSUI = _.get(endpoint.intervals, `staticUpdateIntervals[${updateIndex}]`, 0);
                    // Maybe transmit position report for 'self' vessel
                    if ((mvPUI !== 0) && ((heartbeatCount % mvPUI) === 0) && (myVessel)) {
                        spbt = reportPosition(udpSocket, endpoint, myVessel);
                    }
                    // Maybe transmit static report for 'self' vessel
                    if ((mvSUI !== 0) && ((heartbeatCount % mvSUI) === 0) && (myVessel)) {
                        ssbt = reportStatic(udpSocket, endpoint, myVessel);
                    }
                    // Maybe transmit position reports for AIS targets
                    if ((ovPUI !== 0) && ((heartbeatCount % ovPUI) === 0)) {
                        Object.values(app.getPath('vessels')).filter((vessel) => (vessel.mmsi !== myVessel.mmsi)).forEach((vessel) => {
                            tpbt += reportPosition(udpSocket, endpoint, vessel);
                        });
                    }
                    // Maybe transmit static reports for AIS targets
                    if ((ovSUI !== 0) && ((heartbeatCount % ovSUI) === 0)) {
                        Object.values(app.getPath('vessels')).filter((vessel) => (vessel.mmsi !== myVessel.mmsi)).forEach((vessel) => {
                            tsbt += reportStatic(udpSocket, endpoint, vessel);
                        });
                    }
                    endpoint.updateStatistics(spbt, ssbt, tpbt, tsbt);
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
                Object.keys(stateMap).forEach((key) => {
                    if (key == navigationState)
                        retval = stateMap[key];
                });
            }
            return (retval);
        }
    }
    /**
     * Transmit an AIS Position report for vessel to endpoint using UDP
     * socket.
     *
     * If vessel is 'self', then the position report aistype will be set
     * to type (or 18 if type is not supplied), otherwise the aistype
     * will be set to the type reported by the target vessel.
     *
     * @param socket - Socket to be used for report transmission.
     * @param endpoint - Endpoint to which the report should be sent.
     * @param vessel - the vessel which should be reported.
     * @returns - the number of bytes transmitted over socket.
     */
    function reportPosition(socket, endpoint, vessel) {
        app.debug(`reportPosition(${vessel.mmsi})`);
        var bytesTransmitted = 0;
        try {
            var aisProperties = {};
            // Set common AIS properties...
            aisProperties['aistype'] = (vessel.mmsi.value == app.getSelfPath('mmsi').value) ? ((endpoint.myAisReportClass == 'A') ? 1 : ((endpoint.myAisReportClass == 'B+') ? 19 : 18)) : ((vessel.sensors.ais.class.value == 'A') ? 1 : 18);
            aisProperties['repeat'] = 3;
            aisProperties['mmsi'] = vessel.mmsi;
            aisProperties['sog'] = mpsToKn(_.get(vessel, 'navigation.speedOverGround.value', 0));
            aisProperties['accuracy'] = (_.get(vessel, 'navigation.gnss.positionDilution.value', 0) < 5) ? 1 : 0;
            aisProperties['lon'] = vessel.navigation.position.value.longitude;
            aisProperties['lat'] = vessel.navigation.position.value.latitude;
            aisProperties['cog'] = radsToDeg(_.get(vessel, 'navigation.courseOverGroundTrue.value', 0));
            aisProperties['hdg'] = radsToDeg(_.get(vessel, 'navigation.headingTrue.value', 511));
            console.log(`>>> ${_.get(vessel, 'navigation.maneuver.value', 0)}`);
            aisProperties['smi'] = smi(_.get(vessel, 'navigation.maneuver.value', 0));
            // Set additional Class A AIS properties...
            if (aisProperties['aistype'] == 1) {
                aisProperties['status'] = navigationStatus(vessel.navigation.state);
                aisProperties['rot'] = rot(_.get(vessel, 'navigation.rateOfTurn.value', 128));
            }
            // Set extended Class B AIS properties...
            if (aisProperties['aistype'] == 19) {
                aisProperties['shipname'] = _.get(vessel, 'name', '');
                aisProperties['dimA'] = (_.get(vessel, 'sensors.ais.fromBow.value', 0)).toFixed(0);
                aisProperties['dimB'] = (_.get(vessel, 'design.length.value.overall', 0) - _.get(vessel, 'sensors.gps.fromBow.value', 0)).toFixed(0);
                aisProperties['dimC'] = (_.get(vessel, 'design.beam.value', 0) / 2 + _.get(vessel, 'sensors.gps.fromCenter.value', 0)).toFixed(0);
                aisProperties['dimD'] = (_.get(vessel, 'design.beam.value', 0) / 2 - _.get(vessel, 'sensors.gps.fromCenter.value', 0)).toFixed(0);
            }
            // Encode and transmit message
            var msg = new ggencoder_1.AisEncode(aisProperties);
            if ((msg) && (msg.valid)) {
                bytesTransmitted = sendReportMsg(socket, msg.nmea, endpoint);
            }
            else
                throw new Error('AIS encode failed');
        }
        catch (e) {
            app.debug(`error sending AIS position report for vessel '${vessel.mmsi}' to endpoint '${endpoint.name}' (${e.message})`);
        }
        return (bytesTransmitted);
    }
    /**
     * Transmit an AIS Static & Voyage Related data report for vessel to
     * endpoint using UDP socket.
     *
     * Report aistype is set to 5.
     *
     * @param socket - Socket to be used for report transmission.
     * @param endpoint - Endpoint to be processed.
     * @param vessel - the vessel which should be reported.
     * @returns - the number of bytes transmitted over socket.
     */
    function reportStatic(socket, endpoint, vessel) {
        var bytesTransmitted = 0;
        var aisClass;
        var aisProperties;
        var msgA, msgB;
        var bytesTransmitted;
        if (endpoint.myAisReportClass != 'B+') {
            try {
                aisProperties = {};
                aisProperties['aistype'] = (vessel.mmsi == app.getSelfPath('mmsi')) ? ((endpoint.myAisReportClass == 'A') ? 5 : 24) : (vessel.aisClass == 'A') ? 5 : 24;
                aisProperties['repeat'] = 3;
                aisProperties['mmsi'] = vessel.mmsi;
                aisProperties['shipname'] = _.get(vessel, 'name', '');
                aisProperties['cargo'] = _.get(vessel, 'design.aisShipType.value.id', 0);
                aisProperties['callsign'] = _.get(vessel, 'communication.value.callsignVhf', '');
                aisProperties['dimA'] = (_.get(vessel, 'sensors.ais.fromBow.value', 0)).toFixed(0);
                aisProperties['dimB'] = (_.get(vessel, 'design.length.value.overall', 0) - _.get(vessel, 'sensors.gps.fromBow.value', 0)).toFixed(0);
                aisProperties['dimC'] = (_.get(vessel, 'design.beam.value', 0) / 2 + _.get(vessel, 'sensors.gps.fromCenter.value', 0)).toFixed(0);
                aisProperties['dimD'] = (_.get(vessel, 'design.beam.value', 0) / 2 - _.get(vessel, 'sensors.gps.fromCenter.value', 0)).toFixed(0);
                if (aisProperties['aistype'] == 5) {
                    aisProperties['imo'] = _.get(vessel, 'registrations.imo', '');
                    aisProperties['etaMo'] = etaMo(_.get(vessel, 'navigation.destination.eta', ''));
                    aisProperties['etaDay'] = etaDay(_.get(vessel, 'navigation.destination.eta', ''));
                    aisProperties['etaHr'] = etaHr(_.get(vessel, 'navigation.destination.eta', ''));
                    aisProperties['etaMin'] = etaMin(_.get(vessel, 'navigation.destination.eta', ''));
                    aisProperties['draught'] = (_.get(vessel, 'design.draft.value.current', 0) / 10);
                    aisProperties['destination'] = _.get(vessel, 'navigation.destination.value.commonName', '');
                }
                switch (aisProperties['aistype']) {
                    case '5':
                        aisProperties['aistype'] = 5;
                        msgA = new ggencoder_1.AisEncode(aisProperties);
                        if ((msgA) && (msgA.valid)) {
                            bytesTransmitted = sendReportMsg(socket, msgA.nmea, endpoint);
                        }
                        else
                            throw new Error('AIS encode failed');
                        break;
                    case '24':
                        aisProperties['part'] = 0;
                        msgA = new ggencoder_1.AisEncode(aisProperties);
                        if ((msgA) && (msgA.valid)) {
                            aisProperties['part'] = 1;
                            msgB = new ggencoder_1.AisEncode(aisProperties);
                            if ((msgB) && (msgB.valid)) {
                                bytesTransmitted = sendReportMsg(socket, msgA.nmea, endpoint);
                                bytesTransmitted += sendReportMsg(socket, msgB.nmea, endpoint);
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
        }
        ;
        return (bytesTransmitted);
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
    function etaDay(date) {
        var retval = parseInt(date.slice(8, 2), 10);
        return ((isNaN(retval) ? 0 : retval));
    }
    function etaHr(date) {
        var retval = parseInt(date.slice(11, 2), 10);
        return ((isNaN(retval) ? 24 : retval));
    }
    function etaMo(date) {
        var retval = parseInt(date.slice(5, 2), 10);
        return ((isNaN(retval) ? 0 : retval));
    }
    function etaMin(date) {
        var retval = parseInt(date.slice(14, 2), 10);
        return ((isNaN(retval) ? 60 : retval));
    }
    function navigationStatus(state) {
        var retval = 15;
        switch (state) {
            case 'sailing':
                retval = 8;
                break;
            case 'motoring':
                retval = 0;
                break;
            case 'anchored':
                retval = 1;
                break;
            case 'moored':
                retval = 5;
                break;
            default: break;
        }
        return (retval);
    }
    function radsToDeg(radians) {
        return (radians * 180 / Math.PI);
    }
    function mpsToKn(mps) {
        return (1.9438444924574 * mps);
    }
    function rot(rps) {
        var retval = 128; // no turn data available
        if (rps != 128) {
            var sign = (rps < 0) ? -1 : 1;
            var dpm = (Math.abs(rps) * 3437.7468);
            retval = Math.sqrt((dpm < 708) ? Math.round(dpm) : 126) * 4.733;
            retval = ((retval > 126) ? 126 : retval) * sign;
        }
        return (retval);
    }
    function smi(label) {
        var retval = 0;
        switch (label) {
            case 'No special maneuver':
                retval = 1;
                break;
            case 'Special maneuver':
                retval = 2;
                break;
        }
        return (retval);
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
