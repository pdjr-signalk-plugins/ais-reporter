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

import * as _ from 'lodash';
import { AisEncode, AisEncodeOptions } from 'ggencoder'
import { Socket, createSocket } from 'dgram'
import { PluginStatus } from 'signalk-libpluginstatus';

const PLUGIN_ID: string = 'ais-reporter';
const PLUGIN_NAME: string = 'pdjr-ais-reporter';
const PLUGIN_DESCRIPTION: string = 'Report AIS data to remote UDP services.';
const PLUGIN_SCHEMA: object = {
  "type": "object",
  "required": [ "endpoints" ],
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
        { "type": "array", "items": { "$ref": "#/$defs/interval" }}
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
const PLUGIN_UISCHEMA: object = {};

const DEFAULT_MY_AIS_CLASS = 'B';
const DEFAULT_POSITION_UPDATE_INTERVAL: number = 120;
const DEFAULT_STATIC_DATA_UPDATE_INTERVAL : number = 600;
const DEFAULT_EXPIRY_INTERVAL: number = 900;
const DEFAULT_HEARTBEAT_INTERVAL: number = 60000;

module.exports = function(app: any) {
  var pluginConfiguration: PluginConfiguration;
  var pluginStatus: PluginStatus;
  var udpSocket: Socket;
  var heartbeatInterval: NodeJS.Timeout;
  var heartbeatCount: number = 0;

  const plugin: SKPlugin = {
    id: PLUGIN_ID,
    name: PLUGIN_NAME,
    description: PLUGIN_DESCRIPTION,
    schema: PLUGIN_SCHEMA,
    uiSchema: PLUGIN_UISCHEMA,
  
    start: function(options: any) {
      pluginStatus = new PluginStatus(app, 'started');
      try {
        pluginConfiguration = makePluginConfiguration(options);
        app.debug(`using configuration: ${JSON.stringify(pluginConfiguration, null, 2)}`)

        if (pluginConfiguration.endpoints.length > 0) {
          pluginStatus.setDefaultStatus(`Reporting to ${pluginConfiguration.endpoints.length} endpoint${(pluginConfiguration.endpoints.length == 1)?'':'s'} (${pluginConfiguration.endpoints.map((e) => ('\'' + e.name + '\'')).join(', ')})`);
          heartbeatInterval = startReporting(pluginConfiguration, udpSocket = createSocket('udp4'));
        } else {
          pluginStatus.setDefaultStatus('Stopped: no configured endpoints');
        }
      } catch(e: any) {
        pluginStatus.setDefaultStatus('Stopped: configuration error');
        app.setPluginError(e.message);
      }
    },

    stop: function() {
      clearInterval(heartbeatInterval);
      udpSocket.close();
    },

    registerWithRouter: function(router) {
      router.get('/status', handleRoutes);
    },

    getOpenApi: function() {
      return(require('./openApi.json'));
    }

  }

  function makePluginConfiguration(options: any): PluginConfiguration {
    app.debug(`makePluginConfiguration()...`);
    let pluginConfiguration: PluginConfiguration = {
      myMMSI: app.getSelfPath('mmsi'),
      myAisClass: app.getSelfPath('sensors.ais.class.value') || DEFAULT_MY_AIS_CLASS,
      endpoints: []
    };
    options.endpoints.forEach((option: any) => {
      if (!option.ipAddress) throw new Error('endpoint has missing \'ipAddress\' property');
      if (!option.port) throw new Error('endpoint has missing \'port\' property');
      let endpoint: Endpoint = <Endpoint>{};
      endpoint.name = option.name || option.ipAddress;
      endpoint.ipAddress = option.ipAddress;
      endpoint.port = option.port;
      endpoint.myVessel = <Vessel>{};
      endpoint.myVessel.expiryInterval = getOption([(option.myVessel || {}),option,(options.myVessel || {}),options], 'expiryInterval', DEFAULT_EXPIRY_INTERVAL);
      endpoint.myVessel.positionUpdateIntervals = getOptionArray([(option.myVessel || {}),option,(options.myVessel || {}),options], 'positionUpdateInterval', [DEFAULT_POSITION_UPDATE_INTERVAL]);
      endpoint.myVessel.staticUpdateIntervals = getOptionArray([(option.myVessel || {}),option,(options.myVessel || {}),,options], 'staticUpdateInterval', [DEFAULT_STATIC_DATA_UPDATE_INTERVAL]);
      endpoint.myVessel.overrideTriggerPath = getOption([(option.myVessel || {}),option,(options.myVessel || {}),options], 'overrideTriggerPath', undefined);
      endpoint.otherVessels = <Vessel>{};
      endpoint.otherVessels.expiryInterval = getOption([(option.otherVessels || {}),option,(options.otherVessels || {}),options], 'expiryInterval', DEFAULT_EXPIRY_INTERVAL);
      endpoint.otherVessels.positionUpdateIntervals = getOptionArray([(option.otherVessels || {}),option,(options.otherVessels || {}),options], 'positionUpdateInterval', [DEFAULT_POSITION_UPDATE_INTERVAL]);
      endpoint.otherVessels.staticUpdateIntervals = getOptionArray([(option.otherVessels || {}),option,(options.otherVessels || {}),options], 'staticUpdateInterval', [DEFAULT_STATIC_DATA_UPDATE_INTERVAL]);
      endpoint.otherVessels.overrideTriggerPath = getOption([(option.otherVessels || {}),option,(options.otherVessels || {}),options], 'overrideTriggerPath', undefined);
      endpoint.statistics = {
        lastReportTimestamp: undefined,
        hour: new Array(24).fill(0),
        day: new Array(7).fill(0),
        position: { myVesselTotalReports: 0, myVesselTotalBytes: 0, otherVesselsTotalReports: 0, otherVesselsTotalBytes: 0 },
        static: { myVesselTotalReports: 0, myVesselTotalBytes: 0, otherVesselsTotalReports: 0, otherVesselsTotalBytes: 0 }
      }
      pluginConfiguration.endpoints.push(endpoint);
    });
    return(pluginConfiguration);

    function getOption(objects: any[], name: string, fallback: any): any {
      var retval: any = fallback;
      objects.forEach((object: any) => { if (object[name]) retval = object[name]; });
      return(retval);
    }

    function getOptionArray(objects: any[], name: string, fallback: any): any {
      var retval: any = fallback;
      objects.forEach((object: any) => { if (object[name]) retval = (Array.isArray(object[name]))?object[name]:[object[name]]; });
      return(retval);
    }
  }

  function startReporting(pluginConfiguration: PluginConfiguration, udpSocket: Socket): NodeJS.Timeout {
    return(setInterval(() => {
      app.debug(`checking report requirement (heartbeat ${heartbeatCount})`);
      pluginConfiguration.endpoints.forEach((endpoint) => {
        try {
          var reportStatistics : ReportStatistics = <ReportStatistics>{};
          var totalBytes: number = 0;

          let mvIDX: number = ((endpoint.myVessel.overrideTriggerPath)?(app.getSelfPath(`${endpoint.myVessel.overrideTriggerPath}.value`) || 0):0);
          let ovIDX: number = ((endpoint.otherVessels.overrideTriggerPath)?(app.getSelfPath(`${endpoint.otherVessels.overrideTriggerPath}.value`) || 0):0);
          let mvPUI: number = (inRange(mvIDX,0,endpoint.myVessel.positionUpdateIntervals.length))?endpoint.myVessel.positionUpdateIntervals[mvIDX]:0;
          let mvSUI: number = (inRange(mvIDX,0,endpoint.myVessel.staticUpdateIntervals.length))?endpoint.myVessel.staticUpdateIntervals[mvIDX]:0;
          let ovPUI: number = (inRange(ovIDX,0,endpoint.otherVessels.positionUpdateIntervals.length))?endpoint.otherVessels.positionUpdateIntervals[ovIDX]:0;
          let ovSUI: number = (inRange(ovIDX,0,endpoint.otherVessels.staticUpdateIntervals.length))?endpoint.otherVessels.staticUpdateIntervals[ovIDX]:0;

          app.debug(`mvIDX = ${mvIDX}, mvPUI = ${mvPUI}, mvSUI = ${mvSUI}`);
          app.debug(`ovIDX = ${ovIDX}, ovPUI = ${ovPUI}, ovSUI = ${ovSUI}`);

          if (((mvPUI !== 0) && (heartbeatCount % mvPUI) === 0) || ((ovPUI !== 0) && (heartbeatCount % ovPUI) === 0)) { 
            pluginStatus.setStatus(`sending position report to endpoint '${endpoint.name}'`);
            reportStatistics = reportPosition(udpSocket, endpoint, (mvPUI === 0)?false:((heartbeatCount % mvPUI) === 0), (ovPUI === 0)?false:((heartbeatCount % ovPUI) === 0));
            updateReportStatistics(endpoint.statistics.position, reportStatistics);
            totalBytes = (reportStatistics.myVessel.bytes + reportStatistics.otherVessels.bytes);
          };

          if (((mvSUI !== 0) && (heartbeatCount % mvSUI) === 0) || ((ovSUI !== 0) && (heartbeatCount % ovSUI) === 0)) {
            pluginStatus.setStatus(`sending static data report to endpoint '${endpoint.name}'`);
            reportStatistics = reportStatic(udpSocket, endpoint, (mvSUI === 0)?false:((heartbeatCount % mvSUI) === 0), (ovSUI === 0)?false:((heartbeatCount % ovSUI) === 0));
            updateReportStatistics(endpoint.statistics.static, reportStatistics);
            totalBytes += (reportStatistics.myVessel.bytes + reportStatistics.otherVessels.bytes);
          }

          endpoint.statistics.lastReportTimestamp = Date.now();
          updateByteVectors(endpoint.statistics, totalBytes, heartbeatCount);


        } catch(e: any) {
          app.debug(`${e.message}`);
        }
      });
      heartbeatCount++;
    }, DEFAULT_HEARTBEAT_INTERVAL));

    function updateReportStatistics(endpointReportStatistics: EndpointReportStatistics, reportStatistics: ReportStatistics) {
      endpointReportStatistics.myVesselTotalReports += reportStatistics.myVessel.count;
      endpointReportStatistics.myVesselTotalBytes += reportStatistics.myVessel.bytes;
      endpointReportStatistics.otherVesselsTotalReports += reportStatistics.otherVessels.count;
      endpointReportStatistics.otherVesselsTotalBytes += reportStatistics.otherVessels.bytes;
    }

    function updateByteVectors(endpointStatistics: EndpointStatistics, bytes: number, heartbeat: number) {
      endpointStatistics.hour[0] += bytes;
      if ((heartbeat % 24) == 0) endpointStatistics.hour.slice(23).unshift(0);

      endpointStatistics.day[0] += bytes;
      if ((heartbeat % (1440)) == 0) endpointStatistics.day.slice(6).unshift(0);
    }

  }

  function reportPosition(socket: Socket, endpoint: Endpoint, reportSelf: boolean, reportOthers: boolean): ReportStatistics {
    var reportStatistics: ReportStatistics = { myVessel: { count: 0, bytes: 0 }, otherVessels: { count: 0, bytes: 0 }};
    var aisClass: string;
    var aisProperties: AisEncodeOptions;
    var msg: any;
    var bytesTransmitted: number;

    Object.values(app.getPath('vessels'))
    .filter((vessel: any) => ((reportSelf && (vessel.mmsi == pluginConfiguration.myMMSI)) || (reportOthers && (vessel.mmsi != pluginConfiguration.myMMSI))))
    .filter((vessel: any) => (reportSelf && (_.get(vessel, 'navigation.position.timestamp', false)) && ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (endpoint.myVessel.expiryInterval * 6000)))) || (reportOthers && (_.get(vessel, 'navigation.position.timestamp', false)) && ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (endpoint.otherVessels.expiryInterval * 60000)))))
    .forEach((vessel: any) => {
      try {  
        aisProperties = { mmsi: vessel.mmsi };
        aisClass = (vessel.mmsi == pluginConfiguration.myMMSI)?pluginConfiguration.myAisClass:_.get(vessel, 'sensors.ais.class.value', DEFAULT_MY_AIS_CLASS);
        aisProperties['accuracy'] = 0;
        aisProperties['aistype'] = (aisClass == 'A')?1:18;
        aisProperties['cog'] = radsToDeg(vessel.navigation.courseOverGroundTrue.value);
        aisProperties['hdg'] = _.get(vessel, 'navigation.headingTrue.value', 511);
        aisProperties['lat'] = vessel.navigation.position.value.latitude
        aisProperties['lon'] = vessel.navigation.position.value.longitude
        aisProperties['own'] = (pluginConfiguration.myMMSI == vessel.mmsi)?1:0
        aisProperties['repeat'] = 3
        aisProperties['rot'] = _.get(vessel, 'navigation.rateOfTurn.value', 128);
        aisProperties['sog'] = mpsToKn(vessel.navigation.speedOverGround.value);
        aisProperties['smi'] = decodeSMI(_.get(vessel, 'navigation.specialManeuver', 'not available')); 
        msg = new AisEncode(aisProperties);

        if ((msg) && (msg.valid)) {
          bytesTransmitted = sendReportMsg(socket, msg.nmea, endpoint);
          if ((reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI)) { // reporting self
            reportStatistics.myVessel.count++;
            reportStatistics.myVessel.bytes += bytesTransmitted;
          } else {
            reportStatistics.otherVessels.count++;
            reportStatistics.otherVessels.bytes += bytesTransmitted;
          }
        } else throw new Error('AIS encode failed');
      } catch(e: any) {
        app.debug(`error creating AIS sentence for vessel '${vessel.mmsi}' (${e.message})`)
      }
    });
    return(reportStatistics);
  }

  function reportStatic(socket: Socket, endpoint: Endpoint, reportSelf: boolean = false, reportOthers: boolean = false): ReportStatistics {
    var reportStatistics: ReportStatistics = { myVessel: { count: 0, bytes: 0 }, otherVessels: { count: 0, bytes: 0 }};
    var aisClass: string
    var aisProperties: any
    var msg: any, msgB: any
    var bytesTransmitted: number;
  
    Object.values(app.getPath('vessels'))
    .filter((vessel: any) => ((reportSelf && (vessel.mmsi == pluginConfiguration.myMMSI)) || (reportOthers && (vessel.mmsi != pluginConfiguration.myMMSI))))
    .filter((vessel: any) => (reportSelf && (_.get(vessel, 'navigation.position.timestamp', false)) && ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (endpoint.myVessel.expiryInterval * 6000)))) || (reportOthers && (_.get(vessel, 'navigation.position.timestamp', false)) && ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (endpoint.otherVessels.expiryInterval * 60000)))))
    .forEach((vessel: any) => {
      try {
        aisProperties = { mmsi: vessel.mmsi };
        aisClass = (vessel.mmsi == pluginConfiguration.myMMSI)?pluginConfiguration.myAisClass:_.get(vessel, 'sensors.ais.class.value', DEFAULT_MY_AIS_CLASS);
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
            msg = new AisEncode(aisProperties);
            if ((msg) && (msg.valid)) {
              bytesTransmitted = sendReportMsg(socket, msg.nmea, endpoint);
              if ((reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI)) {
                reportStatistics.myVessel.count++;
                reportStatistics.myVessel.bytes += bytesTransmitted;
              } else {
                reportStatistics.otherVessels.count++;
                reportStatistics.otherVessels.bytes += bytesTransmitted;
              }
            } else throw new Error('AIS encode failed');
            break;
          case 'B':
            aisProperties['aistype'] = 24;
            aisProperties['part'] = 0;
            msg = new AisEncode(aisProperties);
            if ((msg) && (msg.valid)) {
              aisProperties['part'] = 1;
              msgB = new AisEncode(aisProperties);
              if ((msgB) && (msgB.valid)) {
                bytesTransmitted = sendReportMsg(socket, msg.nmea, endpoint);
                bytesTransmitted += sendReportMsg(socket, msgB.nmea, endpoint);
                if ((reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI)) {
                  reportStatistics.myVessel.count++;
                  reportStatistics.myVessel.bytes += bytesTransmitted;
                } else {
                  reportStatistics.otherVessels.count++;
                  reportStatistics.otherVessels.bytes += bytesTransmitted;
                }
              } else throw new Error('AIS Part B encode failed');
            } else throw new Error('AIS Part A encode failed');
            break;
          default:
            break;
        }          
      } catch(e: any) {
        app.debug(`error creating AIS sentence for '${vessel.mmsi}' (${e.message})`)
      }
    });
    return(reportStatistics);
  }

  function sendReportMsg(socket: Socket, msg: string, endpoint: Endpoint): number {
    app.debug(`sending report to endpoint '${endpoint.name}'`);
    var retval: number = 0;
    if (socket) {
      retval = (msg.length + 1);
      socket.send(msg + '\n', 0, msg.length + 1, endpoint.port, endpoint.ipAddress, (e: any) => {
        if (e instanceof Error) app.setPluginStatus(`send failure (${e.message})`)
      });
    } else {
      app.setPluginStatus(`Stopped: UDP port is no longer available`);
    }
    return(retval);
  }


  function inRange(x: number, min: number, max: number): boolean {
    return(((x - min) * (x - max)) <= 0);
  }

  function radsToDeg(radians: number): number {
    return(radians * 180 / Math.PI)
  }
  
  function mpsToKn(mps: number): number {
    return(1.9438444924574 * mps)
  }

  function decodeSMI(label: string): number {
    switch (label) {
      case 'not available': return(0);
      case 'not engaged': return(1);
      case 'engaged': return(2);
      default: return(0);
    }
  }

  function handleRoutes(req: any, res: any) {
    app.debug("processing %s request on %s", req.method, req.path);
    try {
      switch (req.path.slice(0, (req.path.indexOf('/', 1) == -1)?undefined:req.path.indexOf('/', 1))) {
        case '/status':
          const status = (pluginConfiguration.endpoints || []).reduce((a: Dictionary<StatusResponse>, endpoint: Endpoint) => {
            a[endpoint.name] = {
              ipAddress: endpoint.ipAddress,
              port: endpoint.port,
              statistics: endpoint.statistics
            }
            return(a)
          }, {});
          expressSend(res, 200, status, req.path)
          break
      }
    } catch(e: any) {
      app.debug(e.message)
      expressSend(res, ((/^\d+$/.test(e.message))?parseInt(e.message):500), null, req.path)
    }

    function expressSend(res: any, code: number, body: Dictionary<StatusResponse> | null, debugPrefix: any = null) {
      const FETCH_RESPONSES: Dictionary<string | null> = { "200": null, "201": null, "400": "bad request", "403": "forbidden", "404": "not found", "503": "service unavailable (try again later)", "500": "internal server error" }
      res.status(code).send((body)?body:((FETCH_RESPONSES['' + code])?FETCH_RESPONSES['' + code]:null))
      if (debugPrefix) app.debug("%s: %d %s", debugPrefix, code, ((body)?JSON.stringify(body):((FETCH_RESPONSES['' + code])?FETCH_RESPONSES['' + code]:null)))
      return(false);
    }
  }

  return(plugin);
}

interface SKPlugin {
  id: string,
  name: string,
  description: string,
  schema: object,
  uiSchema: object,

  start: (options: any) => void,
  stop: () => void,
  registerWithRouter: (router: any) => void,
  getOpenApi: () => string
}

interface PluginConfiguration {
  myMMSI: string,
  myAisClass: string,
  endpoints: Endpoint[]
}

interface Endpoint {
  name: string,
  ipAddress: string,
  port: number,
  myVessel: Vessel,
  otherVessels: Vessel,
  statistics: EndpointStatistics
}

interface Vessel {
  expiryInterval: number,
  positionUpdateIntervals: number[],
  staticUpdateIntervals: number[],
  overrideTriggerPath: string,
}

interface EndpointStatistics {
  lastReportTimestamp: number | undefined,
  hour: number[],
  day: number[],
  position: EndpointReportStatistics,
  static: EndpointReportStatistics
}

interface EndpointReportStatistics {
  myVesselTotalReports: number,
  myVesselTotalBytes: number,
  otherVesselsTotalReports: number,
  otherVesselsTotalBytes: number
}

interface ReportStatistics {
  myVessel: {
   count: number,
   bytes: number
  },
  otherVessels: {
    count: number,
    bytes: number
  }
}

interface StatusResponse {
  ipAddress: string,
  port: number,
  statistics: EndpointStatistics
}

interface Dictionary<T> {
  [key: string]: T
}
