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

import * as _ from 'lodash';
import { Endpoint } from './Endpoint';
import type { ReportStatistics } from './Endpoint';
import { AisEncode, AisEncodeOptions } from 'ggencoder';
import { Socket, createSocket } from 'dgram';
import { PluginStatus } from 'signalk-libpluginstatus';

const DEFAULT_MY_AIS_CLASS = 'B';
const DEFAULT_ENDPOINT_OPTIONS: any = { myAisReportClass: "B", positionUpdateInterval: 0, staticUpdateInterval: 0 };
const HEARTBEAT_INTERVAL: number = 60000;

const PLUGIN_ID: string = 'ais-reporter';
const PLUGIN_NAME: string = 'ais-reporter';
const PLUGIN_DESCRIPTION: string = 'Report AIS data to remote UDP services.';
import PLUGIN_SCHEMA from './schema.json';
import PLUGIN_UISCHEMA from './uischema.json';

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
      pluginStatus = new PluginStatus(app, `started`);

      try {
        pluginConfiguration = makePluginConfiguration(options, DEFAULT_ENDPOINT_OPTIONS);

        if (pluginConfiguration.endpoints.length > 0) {
          pluginConfiguration.endpoints.forEach((endpoint) => { app.debug(`created endpoint '${endpoint.name}`); });
          pluginStatus.setDefaultStatus(`Reporting to ${pluginConfiguration.endpoints.length} endpoint${(pluginConfiguration.endpoints.length == 1)?'':'s'}`);
          heartbeatInterval = startReporting(pluginConfiguration, udpSocket = createSocket('udp4'), HEARTBEAT_INTERVAL);
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
      router.get('/stop', handleRoutes);
      router.get('/start', handleRoutes);
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
  function makePluginConfiguration(options: any, defaults: any): PluginConfiguration {
    var retval: PluginConfiguration = {
      myMMSI: app.getSelfPath('mmsi'),
      myAisClass: app.getSelfPath('sensors.ais.class.value') || DEFAULT_MY_AIS_CLASS,
      endpoints: options.endpoints.map((option: any) => new Endpoint([ option, options, defaults ], app))
    };
    return(retval);
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
  function startReporting(pluginConfiguration: PluginConfiguration, udpSocket: Socket, heartbeat: number): NodeJS.Timeout {
    return(setInterval(() => {
      pluginConfiguration.endpoints.forEach((endpoint) => {
        try {
          var spbt: number = 0, ssbt: number = 0, tpbt: number = 0, tsbt: number = 0;
          var myVessel: any = Object.values(app.getPath('vessels')).reduce((a: any, v: any) => ((v.mmsi == pluginConfiguration.myMMSI)?v:a), {});

          let updateIndex: number = getUpdateIndex(endpoint.intervals.navigationStateMap);
          let mvPUI: number = _.get(endpoint.intervals, `myPositionUpdateIntervals[${updateIndex}]`, 0);
          let mvSUI: number = _.get(endpoint.intervals, `myStaticUpdateIntervals[${updateIndex}]`, 0);
          let ovPUI: number = _.get(endpoint.intervals, `positionUpdateIntervals[${updateIndex}]`, 0);
          let ovSUI: number = _.get(endpoint.intervals, `staticUpdateIntervals[${updateIndex}]`, 0);
          
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
            Object.values(app.getPath('vessels')).filter((vessel: any) => (vessel.mmsi !== myVessel.mmsi)).forEach((vessel) => {
              tpbt += reportPosition(udpSocket, endpoint, vessel);
            });
          }
          // Maybe transmit static reports for AIS targets
          if ((ovSUI !== 0) && ((heartbeatCount % ovSUI) === 0)) {
            Object.values(app.getPath('vessels')).filter((vessel: any) => (vessel.mmsi !== myVessel.mmsi)).forEach((vessel) => {
              tsbt += reportStatic(udpSocket, endpoint, vessel);
            });
          }
          endpoint.updateStatistics(spbt, ssbt, tpbt, tsbt);
        } catch(e: any) {
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
    function getUpdateIndex(stateMap: any) {
      var retval: number = 0;
      var navigationState: any = app.getSelfPath(`navigation.state.value`);
      if (navigationState) {
        Object.keys(stateMap).forEach((key) => {
          if (key == navigationState) retval = stateMap[key];
        });
      }
      return(retval);
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
  function reportPosition(socket: Socket, endpoint: Endpoint, vessel: any): number {
    app.debug(`reportPosition(${vessel.mmsi})`);
    var bytesTransmitted: number = 0;
    try {
      var aisProperties: any = {};
      // Set common AIS properties...
      aisProperties['aistype'] = (vessel.mmsi.value == app.getSelfPath('mmsi').value)?((endpoint.myAisReportClass == 'A')?1:((endpoint.myAisReportClass == 'B+')?19:18)):((vessel.sensors.ais.class.value == 'A')?1:18);
      aisProperties['repeat'] = 3;
      aisProperties['mmsi'] = vessel.mmsi;
      aisProperties['sog'] = mpsToKn(_.get(vessel, 'navigation.speedOverGround.value', 0));
      aisProperties['accuracy'] = (_.get(vessel ,'navigation.gnss.positionDilution.value', 0) < 5)?1:0;
      aisProperties['lon'] = vessel.navigation.position.value.longitude
      aisProperties['lat'] = vessel.navigation.position.value.latitude
      aisProperties['cog'] = radsToDeg(_.get(vessel, 'navigation.courseOverGroundTrue.value', 0));
      aisProperties['hdg'] = radsToDeg(_.get(vessel, 'navigation.headingTrue.value', 511));
      console.log(`>>> ${vessel.navigation.maneuver.value}`);
      aisProperties['smi'] = smi(vessel.navigation.maneuver.value || 0);
      // Set additional Class A AIS properties...
      if (aisProperties['aistype'] == 1) {
        aisProperties['status'] = navigationStatus(vessel.navigation.state.value);
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
      var msg: any = new AisEncode(aisProperties);
      if ((msg) && (msg.valid)) {
        bytesTransmitted = sendReportMsg(socket, msg.nmea, endpoint);
      } else throw new Error('AIS encode failed');
    } catch (e: any) {
      app.debug(`error sending AIS position report for vessel '${vessel.mmsi}' to endpoint '${endpoint.name}' (${e.message})`)
    }
    return(bytesTransmitted);
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
  function reportStatic(socket: Socket, endpoint: Endpoint, vessel: any): number {
    var bytesTransmitted: number = 0;
    var aisClass: string
    var aisProperties: any
    var msgA: any, msgB: any
    var bytesTransmitted: number;
  
    if (endpoint.myAisReportClass != 'B+') { 
      try {
        aisProperties = {};
        aisProperties['aistype'] = (vessel.mmsi == app.getSelfPath('mmsi'))?((endpoint.myAisReportClass == 'A')?5:24):(vessel.aisClass == 'A')?5:24;
        aisProperties['repeat'] = 3;
        aisProperties['mmsi'] = vessel.mmsi;      
        aisProperties['shipname'] = _.get(vessel, 'name', '');
        aisProperties['cargo'] = _.get(vessel, 'design.aisShipType.value.id', 0);
        aisProperties['callsign'] = _.get(vessel, 'communication.value.callsignVhf','');
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
            msgA = new AisEncode(aisProperties);
            if ((msgA) && (msgA.valid)) {
              bytesTransmitted = sendReportMsg(socket, msgA.nmea, endpoint);
            } else throw new Error('AIS encode failed');
            break;
          case '24':
            aisProperties['part'] = 0;
            msgA = new AisEncode(aisProperties);
            if ((msgA) && (msgA.valid)) {
              aisProperties['part'] = 1;
              msgB = new AisEncode(aisProperties);
              if ((msgB) && (msgB.valid)) {
                bytesTransmitted = sendReportMsg(socket, msgA.nmea, endpoint);
                bytesTransmitted += sendReportMsg(socket, msgB.nmea, endpoint);
              } else throw new Error('AIS Part B encode failed');
            } else throw new Error('AIS Part A encode failed');
            break;
          default:
            break;
        }          
      } catch(e: any) {
        app.debug(`error sending AIS static data report for vessel '${vessel.mmsi}' to endpoint '${endpoint.name}' (${e.message})`)
      }
    };
    return(bytesTransmitted);
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
    var retval: number = 0;
    if (endpoint.enabled) {
      app.debug(`sending "${msg}" to '${endpoint.name}'`);
      socket.send(msg + '\n', 0, msg.length + 1, endpoint.port, endpoint.ipAddress, (e: any) => { });
      retval = (msg.length + 1);
    }
    return(retval);
  }

  function etaDay(date: string) : number {
    var retval: number = parseInt(date.slice(8, 2), 10);
    return((isNaN(retval)?0:retval));
  }

  function etaHr(date: string) : number {
    var retval: number = parseInt(date.slice(11, 2), 10);
    return((isNaN(retval)?24:retval));
  }

  function etaMo(date: string) : number {
    var retval: number = parseInt(date.slice(5, 2), 10);
    return((isNaN(retval)?0:retval));
  }

  function etaMin(date: string) : number {
    var retval: number = parseInt(date.slice(14, 2), 10);
    return((isNaN(retval)?60:retval));
  }

  function navigationStatus(state: string): number {
    console.log(`navstate = ${state}`);
    var retval: number = 15;
    switch (state) {
      case 'sailing' : retval = 8; break;
      case 'motoring' : retval = 0; break;
      case 'anchored' : retval = 1; break;
      case 'moored': retval = 5; break;
      default: break;
    }
    return(retval);
  }

  function radsToDeg(radians: number): number {
    return(radians * 180 / Math.PI)
  }
  
  function mpsToKn(mps: number): number {
    return(1.9438444924574 * mps)
  }

  function rot(rps: number): number {
    var retval = 128; // no turn data available
    if (rps != 128) {
      var sign: number = (rps < 0)?-1:1;
      var dpm = (Math.abs(rps) * 3437.7468);
      retval = Math.sqrt((dpm < 708)?Math.round(dpm):126) * 4.733;
      retval = ((retval > 126)?126:retval) * sign;
    }
    return(retval);
  }

  function smi(label: string): number {
    var retval: number = 0;
    switch (label) {
      case 'No special maneuver': retval = 1; break;
      case 'Special maneuver': retval = 2; break;
    }
    return(retval);
  }

  function handleRoutes(req: any, res: any) {
    app.debug(`handleRoutes(${req.method}, ${req.path})...`);
    var status: any;
    try {
      if (Object.keys(req.query).length != 0) {
        if (req.query.name === undefined) throw new Error("400");
        if (!pluginConfiguration.endpoints.map((e) => e.name).includes(req.query.name)) throw new Error("404");
      }
      switch (req.path.slice(0, (req.path.indexOf('/', 1) == -1)?undefined:req.path.indexOf('/', 1))) {
        case '/status':
          var statusResponse: any = {};
          pluginConfiguration.endpoints.forEach((endpoint) => {
            let hours: number = (endpoint.statistics.started)?(Date.now() - endpoint.statistics.started) / 3600000:1;
            var status: Status = {
              name: endpoint.name,
              ipAddress: endpoint.ipAddress,
              port: endpoint.port,
              started: (endpoint.statistics.started)?(new Date(endpoint.statistics.started)).toISOString():'never',
              totalBytesTransmitted: endpoint.statistics.totalBytes,
              positionSelfBytesPerHour: Math.floor(endpoint.statistics.position.self.bytes / hours),
              positionOthersBytesPerHour: Math.floor(endpoint.statistics.position.others.bytes / hours),
              staticSelfBytesPerHour: Math.floor(endpoint.statistics.static.self.bytes / hours),
              staticOthersBytesPerHour: Math.floor(endpoint.statistics.static.others.bytes / hours)
            };
            if ((Object.keys(req.query).length === 0)) {
              statusResponse[endpoint.name] = status;
            } else if (req.query.name == endpoint.name) {
              statusResponse = status;
            }
          });
          expressSend(res, 200, statusResponse, req.path);
          break;
        case "/start":
          pluginConfiguration.endpoints.forEach((endpoint) => {
            endpoint.enabled = (Object.keys(req.query).length === 0)?true:((endpoint.name == req.query.name)?true:endpoint.enabled);
          });
          expressSend(res, 200, null, req.path);
          break;
        case "/stop":
          pluginConfiguration.endpoints.forEach((endpoint) => {
            endpoint.enabled = (Object.keys(req.query).length === 0)?false:((endpoint.name == req.query.name)?false:endpoint.enabled);
          });
          expressSend(res, 200, null, req.path);
          break;
        default:
          break;
      }
    } catch(e: any) {
      app.debug(e.message)
      expressSend(res, ((/^\d+$/.test(e.message))?parseInt(e.message):500), null, req.path)
    }

    function expressSend(res: any, code: number, body: Dictionary<Status> | null, debugPrefix: any = null) {
      app.debug(`expressSend(res, ${code}, ${JSON.stringify(body)}, ${debugPrefix})...`);
      const FETCH_RESPONSES: Dictionary<string | null> = { "200": "Ok", "201": null, "400": "bad request", "403": "forbidden", "404": "not found", "503": "service unavailable (try again later)", "500": "internal server error" }
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

interface Status {
  name?: string,
  ipAddress?: string,
  enabled?: boolean,
  port?: number,
  started?: string,
  totalBytesTransmitted?: number,
  positionSelfBytesPerHour?: number,
  positionOthersBytesPerHour?: number,
  staticSelfBytesPerHour?: number,
  staticOthersBytesPerHour?: number
}

interface StopResponse {
  endpoints: string[]
}

interface Dictionary<T> {
  [key: string]: T
}
