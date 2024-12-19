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

const DEFAULT_MY_AIS_CLASS = 'B';
const DEFAULT_POSITION_UPDATE_INTERVAL: number = 5;
const DEFAULT_STATIC_DATA_UPDATE_INTERVAL : number = 15;
const DEFAULT_EXPIRY_INTERVAL: number = 15;
const DEFAULT_HEARTBEAT_INTERVAL: number = 60000;

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
        "title": "Ignore vessel data older than this number of minutes",
        "$ref": "#/definitions/interval"
      },
      "positionUpdateInterval": {
        "title": "Position update interval in minutes",
        "$ref": "#/definitions/updateInterval"
      },
      "staticUpdateInterval": {
        "title": "Static data update interval in minutes",
        "$ref": "#/definitions/updateInterval"
      },
      "updateIntervalIndexPath": {
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
        app.debug(`${e.lineNumber}: ${e.message}`);
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
  function makePluginConfiguration(options: any): PluginConfiguration {
    app.debug(`makePluginConfiguration(${JSON.stringify(options)})...`);
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
      endpoint.myVessel.updateIntervalIndexPath = getOption([(option.myVessel || {}),option,(options.myVessel || {}),options], 'updateIntervalIndexPath', undefined);
      endpoint.otherVessels = <Vessel>{};
      endpoint.otherVessels.expiryInterval = getOption([(option.otherVessels || {}),option,(options.otherVessels || {}),options], 'expiryInterval', DEFAULT_EXPIRY_INTERVAL);
      endpoint.otherVessels.positionUpdateIntervals = getOptionArray([(option.otherVessels || {}),option,(options.otherVessels || {}),options], 'positionUpdateInterval', [DEFAULT_POSITION_UPDATE_INTERVAL]);
      endpoint.otherVessels.staticUpdateIntervals = getOptionArray([(option.otherVessels || {}),option,(options.otherVessels || {}),options], 'staticUpdateInterval', [DEFAULT_STATIC_DATA_UPDATE_INTERVAL]);
      endpoint.otherVessels.updateIntervalIndexPath = getOption([(option.otherVessels || {}),option,(options.otherVessels || {}),options], 'updateIntervalIndexPath', undefined);
      endpoint.statistics = {
        started: Date.now(),
        totalBytesTransmitted: 0,
        position: {
          self: { totalReports: 0, totalBytes: 0 },
          others: { totalReports: 0, totalBytes: 0 }
        },
        static: {
          self: { totalReports: 0, totalBytes: 0 },
          others: { totalReports: 0, totalBytes: 0 }
        }
      };
      pluginConfiguration.endpoints.push(endpoint);
    });
    return(pluginConfiguration);

    function getOption(objects: any[], name: string, fallback: any): any {
      if (objects.length == 0) {
        return(fallback);
      } else {
        if (objects[0][name] !== undefined) {
          return(objects[0][name]);
        } else {
          return(getOption(objects.slice(1), name, fallback));
        }
      }
    }

    function getOptionArray(objects: any[], name: string, fallback: any): any {
      if (objects.length == 0) {
        return(fallback);
      } else {
        if (objects[0][name] !== undefined) {
          return((Array.isArray(objects[0][name]))?objects[0][name]:[objects[0][name]]);
        } else {
          return(getOptionArray(objects.slice(1), name, fallback));
        }
      }
    }
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
  function startReporting(pluginConfiguration: PluginConfiguration, udpSocket: Socket): NodeJS.Timeout {
    app.debug(`startReporting(pluginConfiguration, udpSocket)...`);
    return(setInterval(() => {
      app.debug(`reportMaybe(${heartbeatCount})...`);
      pluginConfiguration.endpoints.forEach((endpoint) => {
        try {
          var reportStatistics : ReportStatistics = <ReportStatistics>{};
          var totalBytes: number = 0;

          let mvIDX: number = ((endpoint.myVessel.updateIntervalIndexPath)?(app.getSelfPath(`${endpoint.myVessel.updateIntervalIndexPath}.value`) || 0):0);
          let ovIDX: number = ((endpoint.otherVessels.updateIntervalIndexPath)?(app.getSelfPath(`${endpoint.otherVessels.updateIntervalIndexPath}.value`) || 0):0);
          let mvPUI: number = _.get(endpoint, `myVessel.positionUpdateIntervals[${mvIDX}]`, 0);
          let mvSUI: number = _.get(endpoint, `myVessel.staticUpdateIntervals[${mvIDX}]`, 0);
          let ovPUI: number = _.get(endpoint, `otherVessels.positionUpdateIntervals[${ovIDX}]`, 0);
          let ovSUI: number = _.get(endpoint, `otherVessels.staticUpdateIntervals[${ovIDX}]`, 0);
          
          app.debug(`mvIDX = ${mvIDX}, mvPUI = ${mvPUI}, mvSUI = ${mvSUI}`);
          app.debug(`ovIDX = ${ovIDX}, ovPUI = ${ovPUI}, ovSUI = ${ovSUI}`);

          if (((mvPUI !== 0) && ((heartbeatCount % mvPUI) === 0)) || ((ovPUI !== 0) && ((heartbeatCount % ovPUI) === 0))) { 
            pluginStatus.setStatus(`sending position report to endpoint '${endpoint.name}'`);
            reportStatistics = reportPosition(udpSocket, endpoint, (mvPUI === 0)?false:((heartbeatCount % mvPUI) === 0), (ovPUI === 0)?false:((heartbeatCount % ovPUI) === 0));
            updateReportStatistics(endpoint.statistics.position, reportStatistics);
            totalBytes = (reportStatistics.self.bytes + reportStatistics.others.bytes);
          };

          if (((mvSUI !== 0) && ((heartbeatCount % mvSUI) === 0)) || ((ovSUI !== 0) && ((heartbeatCount % ovSUI) === 0))) {
            pluginStatus.setStatus(`sending static data report to endpoint '${endpoint.name}'`);
            reportStatistics = reportStatic(udpSocket, endpoint, (mvSUI === 0)?false:((heartbeatCount % mvSUI) === 0), (ovSUI === 0)?false:((heartbeatCount % ovSUI) === 0));
            updateReportStatistics(endpoint.statistics.static, reportStatistics);
            totalBytes += (reportStatistics.self.bytes + reportStatistics.others.bytes);
          }

          endpoint.statistics.totalBytesTransmitted += totalBytes;

        } catch(e: any) {
          app.debug(`${e.message}`);
        }
      });
      heartbeatCount++;
    }, DEFAULT_HEARTBEAT_INTERVAL));

    function updateReportStatistics(endpointReportStatistics: EndpointReportStatistics, reportStatistics: ReportStatistics) {
      app.debug(`updateReportStatistics(endpointReportStatistics, ${JSON.stringify(reportStatistics)})...`);
      endpointReportStatistics.self.totalReports += reportStatistics.self.count;
      endpointReportStatistics.self.totalBytes += reportStatistics.self.bytes;
      endpointReportStatistics.others.totalReports += reportStatistics.others.count;
      endpointReportStatistics.others.totalBytes += reportStatistics.others.bytes;
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
  function reportPosition(socket: Socket, endpoint: Endpoint, reportSelf: boolean, reportOthers: boolean): ReportStatistics {
    app.debug(`reportPosition(socket, ${endpoint.name}, ${reportSelf}, ${reportOthers})...`)
    var reportStatistics: ReportStatistics = { self: { count: 0, bytes: 0 }, others: { count: 0, bytes: 0 }};
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
        aisProperties['cog'] = radsToDeg(_.get(vessel, 'navigation.courseOverGroundTrue.value', 0));
        aisProperties['hdg'] = _.get(vessel, 'navigation.headingTrue.value', 511);
        aisProperties['lat'] = vessel.navigation.position.value.latitude
        aisProperties['lon'] = vessel.navigation.position.value.longitude
        aisProperties['own'] = (pluginConfiguration.myMMSI == vessel.mmsi)?1:0
        aisProperties['repeat'] = 3
        aisProperties['rot'] = _.get(vessel, 'navigation.rateOfTurn.value', 128);
        aisProperties['sog'] = mpsToKn(_.get(vessel, 'navigation.speedOverGround.value', 0));
        aisProperties['smi'] = decodeSMI(_.get(vessel, 'navigation.specialManeuver', 'not available')); 
        msg = new AisEncode(aisProperties);

        if ((msg) && (msg.valid)) {
          bytesTransmitted = sendReportMsg(socket, msg.nmea, endpoint);
          if ((reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI)) { // reporting self
            reportStatistics.self.count++;
            reportStatistics.self.bytes += bytesTransmitted;
          } else {
            reportStatistics.others.count++;
            reportStatistics.others.bytes += bytesTransmitted;
          }
        } else throw new Error('AIS encode failed');
      } catch(e: any) {
        app.debug(`error sending AIS position report for vessel '${vessel.mmsi}' to endpoint '${endpoint.name}' (${e.message})`)
      }
    });
    return(reportStatistics);
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
  function reportStatic(socket: Socket, endpoint: Endpoint, reportSelf: boolean = false, reportOthers: boolean = false): ReportStatistics {
    app.debug(`reportStatic(socket, ${endpoint.name}, ${reportSelf}, ${reportOthers})...`)
    var reportStatistics: ReportStatistics = { self: { count: 0, bytes: 0 }, others: { count: 0, bytes: 0 }};
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
                reportStatistics.self.count++;
                reportStatistics.self.bytes += bytesTransmitted;
              } else {
                reportStatistics.others.count++;
                reportStatistics.others.bytes += bytesTransmitted;
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
                  reportStatistics.self.count++;
                  reportStatistics.self.bytes += bytesTransmitted;
                } else {
                  reportStatistics.others.count++;
                  reportStatistics.others.bytes += bytesTransmitted;
                }
              } else throw new Error('AIS Part B encode failed');
            } else throw new Error('AIS Part A encode failed');
            break;
          default:
            break;
        }          
      } catch(e: any) {
        app.debug(`error sending AIS static data report for vessel '${vessel.mmsi}' to endpoint '${endpoint.name}' (${e.message})`)
      }
    });
    return(reportStatistics);
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
  function sendReportMsg(socket: Socket, msg: string, endpoint: Endpoint): number {
    app.debug(`sendReportMsg(socket, ${msg}, ${endpoint.name})...`);
    socket.send(msg + '\n', 0, msg.length + 1, endpoint.port, endpoint.ipAddress, (e: any) => { });
    return(msg.length + 1);
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
    app.debug(`handleRoutes(${req.method}, ${req.path})...`);
    try {
      switch (req.path.slice(0, (req.path.indexOf('/', 1) == -1)?undefined:req.path.indexOf('/', 1))) {
        case '/status':
          const status = (pluginConfiguration.endpoints || []).reduce((a: Dictionary<StatusResponse>, endpoint: Endpoint) => {
            let hours: number = (endpoint.statistics.started)?(Date.now() - endpoint.statistics.started) / 3600000:1;
            a[endpoint.name] = {
              ipAddress: endpoint.ipAddress,
              port: endpoint.port,
              started: (endpoint.statistics.started)?(new Date(endpoint.statistics.started)).toISOString():'never',
              totalBytesTransmitted: endpoint.statistics.totalBytesTransmitted,
              positionSelfBytesPerHour: Math.floor(endpoint.statistics.position.self.totalBytes / hours),
              positionOthersBytesPerHour: Math.floor(endpoint.statistics.position.others.totalBytes / hours),
              staticSelfBytesPerHour: Math.floor(endpoint.statistics.static.self.totalBytes / hours),
              staticOthersBytesPerHour: Math.floor(endpoint.statistics.static.others.totalBytes / hours)
            };
            return(a);
          }, {});
          expressSend(res, 200, status, req.path);
          break;
        default:
          break;
      }
    } catch(e: any) {
      app.debug(e.message)
      expressSend(res, ((/^\d+$/.test(e.message))?parseInt(e.message):500), null, req.path)
    }

    function expressSend(res: any, code: number, body: Dictionary<StatusResponse> | null, debugPrefix: any = null) {
      app.debug(`expressSend(res, ${code}, ${JSON.stringify(body)}, ${debugPrefix})...`);
      const FETCH_RESPONSES: Dictionary<string | null> = { "200": null, "201": null, "400": "bad request", "403": "forbidden", "404": "not found", "503": "service unavailable (try again later)", "500": "internal server error" }
      res.status(code).send((body)?body:((FETCH_RESPONSES['' + code])?FETCH_RESPONSES['' + code]:null))
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
  updateIntervalIndexPath: string,
}

interface EndpointStatistics {
  started: number | undefined,
  totalBytesTransmitted: number,  
  position: EndpointReportStatistics,
  static: EndpointReportStatistics
}

interface EndpointReportStatistics {
  self: {
    totalReports: number,
    totalBytes: number
  },
  others: {
    totalReports: number,
    totalBytes: number
  }
}

interface ReportStatistics {
  self: {
   count: number,
   bytes: number
  },
  others: {
    count: number,
    bytes: number
  }
}

interface StatusResponse {
  ipAddress: string,
  port: number,
  started: string,
  totalBytesTransmitted: number,
  positionSelfBytesPerHour: number,
  positionOthersBytesPerHour: number,
  staticSelfBytesPerHour: number,
  staticOthersBytesPerHour: number
}

interface Dictionary<T> {
  [key: string]: T
}
