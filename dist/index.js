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
const _ = require("lodash");
const PLUGIN_ID = "ais-reporter";
const PLUGIN_NAME = "pdjr-ais-reporter";
const PLUGIN_DESCRIPTION = "Report AIS data to remote UDP services.";
const PLUGIN_SCHEMA = {
    type: 'object',
    required: ["endpoints"],
    properties: {
        endpoints: {
            type: 'array',
            title: 'UDP endpoints to report to',
            items: {
                type: 'object',
                required: ['ipaddress', 'port'],
                properties: {
                    ipaddress: {
                        type: 'string',
                        title: 'UDP endpoint IP address',
                        default: '0.0.0.0'
                    },
                    port: {
                        type: 'number',
                        title: 'Port',
                        default: 12345
                    }
                }
            }
        },
        positionupdateinterval: {
            type: 'number',
            title: 'Position update interval (s)',
            default: 60
        },
        staticupdateinterval: {
            type: 'number',
            title: 'Static data update interval (s)',
            default: 360
        },
        expiryinterval: {
            type: 'number',
            title: 'Ignore data older than (s)',
            default: 3600
        },
        reportself: {
            type: 'boolean',
            title: 'Report own vessel (self)?',
            default: true
        },
        reportothers: {
            type: 'boolean',
            title: 'Report other vessels?',
            default: false
        },
        myaisclass: {
            type: 'string',
            title: 'Own vessel AIS transceiver type',
            enum: ['A', 'B'],
            enumNames: ['Class A', 'Class B'],
            default: 'B'
        }
    }
};
const PLUGIN_UISCHEMA = {};
module.exports = function (app) {
    let udpSocket = undefined;
    let intervalIds = [];
    let options = undefined;
    const plugin = {
        id: PLUGIN_ID,
        name: PLUGIN_NAME,
        description: PLUGIN_DESCRIPTION,
        schema: PLUGIN_SCHEMA,
        uiSchema: PLUGIN_UISCHEMA,
        start: function (props) {
            options = _.cloneDeep(props);
            options.mymmsi = app.getSelfPath('mmsi');
            app.debug(`using configuration: ${JSON.stringify(options, null, 2)}`);
            udpSocket = dgram.createSocket('udp4');
            if ((options.endpoints) && (options.endpoints.length > 0)) {
                if (options.positionupdateinterval > 0) {
                    intervalIds.push(Number(setInterval(reportPositions, (options.positionupdateinterval * 1000))));
                }
                if ((options.positionupdateinterval > 0) && (options.staticupdateinterval > 0)) {
                    options.staticupdateinterval = (options.staticupdateinterval < options.positionupdateinterval) ? options.positionupdateinterval : options.staticupdateinterval;
                    intervalIds.push(Number(setInterval(reportStaticData, (options.staticupdateinterval * 1000))));
                }
            }
            app.setPluginStatus(`Reporting to ${options.endpoints.length} endpoint(s)`);
        },
        stop: function () {
            intervalIds.forEach((id) => clearInterval(id));
            intervalIds = [];
        }
    };
    function reportPositions() {
        var aisClass;
        var aisProperties;
        var count = 0;
        var msg;
        Object.values(app.getPath('vessels')).forEach((vessel) => {
            try {
                if ((!options.reportself) && (vessel.mmsi == options.mymmsi))
                    return;
                if ((!options.reportothers) && (vessel.mmsi != options.mymmsi))
                    return;
                aisProperties = { mmsi: vessel.mmsi };
                aisClass = (vessel.mmsi == options.mymmsi) ? options.myaisclass : vessel.sensors.ais.class.value;
                if ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (options.expiryinterval * 1000))) {
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
                    aisProperties['own'] = (options.mymmsi == vessel.mmsi) ? 1 : 0;
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
                        options.endpoints.forEach((endpoint) => sendReportMsg(msg.nmea, endpoint));
                        count++;
                    }
                    else {
                        app.debug(`error creating position report for '${vessel.mmsi}'`);
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
        app.setPluginStatus(`Last sent ${count} position report(s) to ${options.endpoints.length} endpoint(s)`);
    }
    function reportStaticData() {
        var aisClass;
        var aisProperties;
        var count = 0;
        var msg, msgB;
        Object.values(app.getPath('vessels')).forEach((vessel) => {
            try {
                if ((!options.reportself) && (vessel.mmsi == options.mymmsi))
                    return;
                if ((!options.reportothers) && (vessel.mmsi != options.mymmsi))
                    return;
                aisProperties = { mmsi: vessel.mmsi };
                aisClass = (vessel.mmsi == options.mymmsi) ? options.myaisclass : vessel.sensors.ais.class.value;
                if ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (options.expiryinterval * 1000))) {
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
                                options.endpoints.forEach((endpoint) => sendReportMsg(msg.nmea, endpoint));
                                count++;
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
                                    options.endpoints.forEach((endpoint) => sendReportMsg(msg.nmea, endpoint));
                                    options.endpoints.forEach((endpoint) => sendReportMsg(msgB.nmea, endpoint));
                                    count++;
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
        app.setPluginStatus(`Last sent ${count} static data report(s) to ${options.endpoints.length} endpoint(s)`);
    }
    function sendReportMsg(msg, endpoint) {
        if (udpSocket) {
            udpSocket.send(msg + '\n', 0, msg.length + 1, endpoint.port, endpoint.ipaddress, (e) => {
                if (e instanceof Error)
                    app.setPluginStatus(`send failure (${e.message})`);
            });
        }
        else {
            app.setPluginStatus(`UDP port is no longer available`);
        }
    }
    return (plugin);
};
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
