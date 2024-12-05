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
const dgram = require("dgram");
const signalk_libpluginstatus_1 = require("signalk-libpluginstatus");
const PLUGIN_ID = "ais-reporter";
const PLUGIN_NAME = "pdjr-ais-reporter";
const PLUGIN_DESCRIPTION = "Report AIS data to remote UDP services.";
const PLUGIN_SCHEMA = {
    type: 'object',
    required: ["endpoints"],
    properties: {
        myaisclass: {
            type: 'string',
            title: 'Own vessel AIS transceiver type',
            enum: ['none', 'A', 'B'],
            enumNames: ['none', 'Class A', 'Class B'],
            default: 'B'
        },
        positionupdateinterval: {
            type: 'number',
            title: 'Position update interval (s)'
        },
        staticdataupdateinterval: {
            type: 'number',
            title: 'Static data update interval (s)'
        },
        expiryinterval: {
            type: 'number',
            title: 'Ignore data older than (s)'
        },
        reportself: {
            type: 'boolean',
            title: 'Report own vessel (self)?'
        },
        reportothers: {
            type: 'boolean',
            title: 'Report other vessels?'
        },
        endpoints: {
            type: 'array',
            title: 'UDP endpoints to report to',
            items: {
                type: 'object',
                required: ['ipaddress', 'port'],
                properties: {
                    name: {
                        type: 'string',
                        title: 'Endpoint name',
                    },
                    ipaddress: {
                        type: 'string',
                        title: 'UDP endpoint IP address'
                    },
                    port: {
                        type: 'number',
                        title: 'Port'
                    },
                    positionupdateinterval: {
                        type: 'number',
                        title: 'Position update interval (s)'
                    },
                    staticdataupdateinterval: {
                        type: 'number',
                        title: 'Static data update interval (s)'
                    },
                    expiryinterval: {
                        type: 'number',
                        title: 'Ignore data older than (s)'
                    },
                    reportself: {
                        type: 'boolean',
                        title: 'Report own vessel (self)?'
                    },
                    reportothers: {
                        type: 'boolean',
                        title: 'Report other vessels?'
                    }
                }
            }
        }
    }
};
const PLUGIN_UISCHEMA = {};
const DEFAULT_MY_AIS_CLASS = 'B';
const DEFAULT_POSITION_UPDATE_INTERVAL = 120;
const DEFAULT_STATIC_DATA_UPDATE_INTERVAL = 600;
const DEFAULT_EXPIRY_INTERVAL = 900;
const DEFAULT_REPORT_SELF = true;
const DEFAULT_REPORT_OTHERS = false;
module.exports = function (app) {
    var udpSocket = undefined;
    var pluginConfiguration = {};
    var pluginStatus = new signalk_libpluginstatus_1.PluginStatus(app, '', 3, true);
    const plugin = {
        id: PLUGIN_ID,
        name: PLUGIN_NAME,
        description: PLUGIN_DESCRIPTION,
        schema: PLUGIN_SCHEMA,
        uiSchema: PLUGIN_UISCHEMA,
        start: function (options) {
            try {
                pluginConfiguration = makePluginConfiguration(options);
                app.debug(`using configuration: ${JSON.stringify(pluginConfiguration, null, 2)}`);
                udpSocket = dgram.createSocket('udp4');
                if ((pluginConfiguration.endpoints) && (pluginConfiguration.endpoints.length > 0)) {
                    pluginStatus.setDefaultStatus(`Started: reporting to ${pluginConfiguration.endpoints.map((e) => ('\'' + e.name + '\'')).join(', ')}`);
                    pluginConfiguration.endpoints.forEach((endpoint) => {
                        if (endpoint.positionUpdateInterval > 0) {
                            endpoint.intervalIds.push(setInterval(reportPositions.bind(this, endpoint, pluginStatus), (endpoint.positionUpdateInterval * 1000)));
                        }
                        if ((endpoint.positionUpdateInterval > 0) && (endpoint.staticDataUpdateInterval > 0)) {
                            endpoint.staticDataUpdateInterval = (endpoint.staticDataUpdateInterval < endpoint.positionUpdateInterval) ? endpoint.positionUpdateInterval : endpoint.staticDataUpdateInterval;
                            endpoint.intervalIds.push(setInterval(reportStaticData.bind(this, endpoint, pluginStatus), (endpoint.staticDataUpdateInterval * 1000)));
                        }
                    });
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
            if (pluginConfiguration.endpoints) {
                pluginConfiguration.endpoints.forEach((endpoint) => {
                    endpoint.intervalIds.forEach((intervalId) => clearInterval(intervalId));
                    endpoint.intervalIds = [];
                });
            }
        }
    };
    function makePluginConfiguration(options) {
        let pluginConfiguration = {
            myMMSI: app.getSelfPath('mmsi'),
            myAisClass: (options.myaisclass || app.getSelfPath('sensors.ais.class.value') || DEFAULT_MY_AIS_CLASS),
            endpoints: []
        };
        options.endpoints.forEach((endpointOption) => {
            if (!endpointOption.ipaddress)
                throw new Error('endpoint had missing \'ipaddress\' property');
            if (!endpointOption.port)
                throw new Error('endpoint had missing \'port\' property');
            let endpoint = {
                name: endpointOption.name || endpointOption.ipAddress,
                ipAddress: endpointOption.ipaddress,
                port: endpointOption.port,
                positionUpdateInterval: (endpointOption.positionupdateinterval || options.positionupdateinterval || DEFAULT_POSITION_UPDATE_INTERVAL),
                staticDataUpdateInterval: (endpointOption.staticdataupdateinterval || options.staticdataupdateinterval || DEFAULT_STATIC_DATA_UPDATE_INTERVAL),
                expiryInterval: (endpointOption.expiryinterval || options.expiryinterval || DEFAULT_EXPIRY_INTERVAL),
                reportSelf: (endpointOption.reportself || options.reportself || DEFAULT_REPORT_SELF),
                reportOthers: (endpointOption.reportothers || options.reportothers || DEFAULT_REPORT_OTHERS),
                intervalIds: []
            };
            pluginConfiguration.endpoints?.push(endpoint);
        });
        return (pluginConfiguration);
    }
    function reportPositions(endpoint, pluginStatus) {
        var aisClass;
        var aisProperties;
        var msg;
        pluginStatus.setStatus(`sending report to '${endpoint.name}'`);
        Object.values(app.getPath('vessels')).forEach((vessel) => {
            try {
                if ((!endpoint.reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI))
                    return;
                if ((!endpoint.reportOthers) && (vessel.mmsi != pluginConfiguration.myMMSI))
                    return;
                aisProperties = { mmsi: vessel.mmsi };
                aisClass = (vessel.mmsi == pluginConfiguration.myMMSI) ? pluginConfiguration.myAisClass : vessel.sensors.ais.class.value;
                if ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (endpoint.expiryInterval * 1000))) {
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
                    if ((msg) && (msg.valid)) {
                        app.debug(`created position report for '${vessel.mmsi}' (${msg.nmea})`);
                        sendReportMsg(msg.nmea, endpoint);
                    }
                    else {
                        //app.debug(`error creating position report for '${vessel.mmsi}'`)
                    }
                }
                else {
                    //app.debug(`ignoring inactive vessel '${vessel.mmsi}'`)
                }
            }
            catch (e) {
                if (e instanceof Error) {
                    //app.debug(`error creating AIS sentence configuration for '${vessel.mmsi}' (${e.message})`)
                }
            }
        });
    }
    function reportStaticData(endpoint, pluginStatus) {
        var aisClass;
        var aisProperties;
        var msg, msgB;
        Object.values(app.getPath('vessels')).forEach((vessel) => {
            try {
                if ((!endpoint.reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI))
                    return;
                if ((!endpoint.reportOthers) && (vessel.mmsi != pluginConfiguration.myMMSI))
                    return;
                aisProperties = { mmsi: vessel.mmsi };
                aisClass = (vessel.mmsi == pluginConfiguration.myMMSI) ? pluginConfiguration.myAisClass : vessel.sensors.ais.class.value;
                if ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (endpoint.expiryInterval * 1000))) {
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
                                app.debug(`created static data report for '${vessel.mmsi}' (${msg.nmea})`);
                                sendReportMsg(msg.nmea, endpoint);
                            }
                            else {
                                app.debug(`error creating static data report for '${vessel.mmsi}'`);
                            }
                            break;
                        case 'B':
                            aisProperties['aistype'] = 24;
                            aisProperties['part'] = 0;
                            msg = new ggencoder_1.AisEncode(aisProperties);
                            if ((msg) && (msg.valid)) {
                                aisProperties['part'] = 1;
                                msgB = new ggencoder_1.AisEncode(aisProperties);
                                if ((msgB) && (msgB.valid)) {
                                    app.debug(`created static data report for '${vessel.mmsi}'`);
                                    sendReportMsg(msg.nmea, endpoint);
                                    sendReportMsg(msgB.nmea, endpoint);
                                }
                                else {
                                    app.debug(`error creating static data report for '${vessel.mmsi}' (Part 2 failed)`);
                                }
                            }
                            else {
                                app.debug(`error creating static data report for '${vessel.mmsi}' (Part 1 failed)`);
                            }
                            break;
                        default:
                            break;
                    }
                }
                else {
                    app.debug(`ignoring inactive vessel '${vessel.mmsi}'`);
                }
            }
            catch (e) {
                if (e instanceof Error) {
                    app.debug(`error creating AIS sentence configuration for '${vessel.mmsi}' (${e.message})`);
                }
            }
        });
    }
    function sendReportMsg(msg, endpoint) {
        if (udpSocket) {
            udpSocket.send(msg + '\n', 0, msg.length + 1, endpoint.port, endpoint.ipAddress, (e) => {
                if (e instanceof Error)
                    app.setPluginStatus(`send failure (${e.message})`);
            });
        }
        else {
            app.setPluginStatus(`Stopped: UDP port is no longer available`);
        }
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
    return (plugin);
};
