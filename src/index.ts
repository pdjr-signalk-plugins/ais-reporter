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
import { EventStream } from 'baconjs';
import { AisEncode, AisEncodeOptions } from 'ggencoder'
import { Socket, createSocket } from 'dgram'
import { PluginStatus } from 'signalk-libpluginstatus';

const PLUGIN_ID: string = "ais-reporter";
const PLUGIN_NAME: string = "pdjr-ais-reporter";
const PLUGIN_DESCRIPTION: string = "Report AIS data to remote UDP services.";
const PLUGIN_SCHEMA: object = {
  type: 'object',
  required: [ "endpoints" ],
  properties: {
    myAisClass: {
      title: 'Own vessel AIS transceiver type',
      type: 'string',
      enum: [ 'none', 'A', 'B' ],
      enumNames: [ 'none', 'Class A', 'Class B' ],
      default: 'B'
    },
    expiryinterval: {
      title: 'Ignore vessel data older than (s)',
      type: 'number'
    },
    myVessel: {
      type: 'object',
      properties: {
        positionUpdateIntervals: {
          title: 'Position update intervals (default, override)',
          type: 'array',
          items: { type: 'number' }
        },
        staticUpdateIntervals: {
          title: 'Static data update interval (default, override)',
          type: 'array',
          items: { type: 'number' }
        },
        overrideTriggerPath: {
          title: 'Path which triggers this override',
          type: 'string'
        }
      }
    },
    otherVessels: {
      type: 'object',
      properties: {
        positionUpdateIntervals: {
          title: 'Position update intervals (default, override)',
          type: 'array',
          items: { type: 'number' }
        },
        staticUpdateIntervals: {
          title: 'Static data update interval (default, override)',
          type: 'array',
          items: { type: 'number' }
        },
        overrideTriggerPath: {
          title: 'Path which triggers this override',
          type: 'string'
        }
      }
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
          expiryinterval: {
            title: 'Ignore vessel data older than (s)',
            type: 'number'
          },
          myVessel: {
            type: 'object',
            properties: {
              positionUpdateIntervals: {
                title: 'Position update intervals (default, override)',
                type: 'array',
                items: { type: 'number' }
              },
              staticUpdateIntervals: {
                title: 'Static data update interval (default, override)',
                type: 'array',
                items: { type: 'number' }
              },
              overrideTriggerPath: {
                title: 'Path which triggers this override',
                type: 'string'
              }
            }
          },
          otherVessels: {
            type: 'object',
            properties: {
              positionUpdateIntervals: {
                title: 'Position update intervals (default, override)',
                type: 'array',
                items: { type: 'number' }
              },
              staticUpdateIntervals: {
                title: 'Static data update interval (default, override)',
                type: 'array',
                items: { type: 'number' }
              },
              overrideTriggerPath: {
                title: 'Path which triggers this override',
                type: 'string'
              }
            }
          }
        }        
      }
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
    let pluginConfiguration: PluginConfiguration = {
      myMMSI: app.getSelfPath('mmsi'),
      myAisClass: (options.myaisclass || app.getSelfPath('sensors.ais.class.value') || DEFAULT_MY_AIS_CLASS),
      endpoints: []
    };
    options.endpoints.forEach((option: any) => {
      if (!option.ipAddress) throw new Error('endpoint has missing \'ipAddress\' property');
      if (!option.port) throw new Error('endpoint has missing \'port\' property');
      let endpoint: Endpoint = {
        name: option.name || option.ipAddress,
        ipAddress: option.ipAddress,
        port: option.port,
        expiryInterval: _.get(option, 'expiryInterval', _.get(options, 'expiryInterval', DEFAULT_EXPIRY_INTERVAL)),
        myVessel: {
          positionUpdateIntervals: [
            _.get(option, 'myVessel.positionUpdateIntervals[0]', _.get(options, 'myVessel.positionUpdateIntervals[0]', DEFAULT_POSITION_UPDATE_INTERVAL)),
            _.get(option, 'myVessel.positionUpdateIntervals[1]', _.get(options, 'myVessel.positionUpdateIntervals[1]', DEFAULT_POSITION_UPDATE_INTERVAL))
          ],
          staticUpdateIntervals: [
            _.get(option, 'myVessel.staticUpdateIntervals[0]', _.get(options, 'myVessel.staticUpdateIntervals[0]', DEFAULT_STATIC_DATA_UPDATE_INTERVAL)),
            _.get(option, 'myVessel.staticUpdateIntervals[1]', _.get(options, 'myVessel.staticUpdateIntervals[1]', DEFAULT_STATIC_DATA_UPDATE_INTERVAL))
          ],
          overrideTriggerPath: _.get(option, 'myVessel.overrideTriggerPath', _.get(option, 'overrideTriggerPath', _.get(options, 'myVessel.overrideTriggerPath', _.get(options, 'overrideTriggerPath', undefined)))),
          positionReportCount: 0,
          staticReportCount: 0
        },
        otherVessels: {
          positionUpdateIntervals: [
            _.get(option, 'otherVessels.positionUpdateIntervals[0]', _.get(options, 'otherVessels.positionUpdateInterval[0]', DEFAULT_POSITION_UPDATE_INTERVAL)),
            _.get(option, 'otherVessels.positionUpdateIntervals[1]', _.get(options, 'otherVessels.positionUpdateInterval[1]', DEFAULT_POSITION_UPDATE_INTERVAL))
          ],
          staticUpdateIntervals: [
            _.get(option, 'otherVessels.staticUpdateIntervals[0]', _.get(options, 'otherVessels.staticUpdateInterval[0]', DEFAULT_STATIC_DATA_UPDATE_INTERVAL)),
            _.get(option, 'otherVessels.staticUpdateIntervals[1]', _.get(options, 'otherVessels.staticUpdateInterval[1]', DEFAULT_STATIC_DATA_UPDATE_INTERVAL))
          ],
          overrideTriggerPath: _.get(option, 'otherVessels.overrideTriggerPath', _.get(options, 'otherVessels.overrideTriggerPath', undefined)),
          positionReportCount: 0,
          staticReportCount: 0
        },
        lastReportTimestamp: undefined,
      }
      pluginConfiguration.endpoints?.push(endpoint);
    });
    return(pluginConfiguration);
  }

  function startReporting(pluginConfiguration: PluginConfiguration, udpSocket: Socket): NodeJS.Timeout {
    return(setInterval(() => {
      app.debug(`checking report requirement (heartbeat ${heartbeatCount})`);
      pluginConfiguration.endpoints.forEach((endpoint) => {
        var reportCount : number;
        let mvIDX: number | undefined = (endpoint.myVessel.overrideTriggerPath)?app.getSelfPath(endpoint.myVessel.overrideTriggerPath):0;
        let mvPUI: number | undefined = _.get(endpoint, `myVessel.positionUpdateIntervals[${mvIDX}]`, undefined);
        let mvSUI: number | undefined = _.get(endpoint, `myVessel.staticUpdateIntervals[${mvIDX}]`, undefined);
        let ovIDX: number | undefined = (endpoint.otherVessels.overrideTriggerPath)?app.getSelfPath(endpoint.otherVessels.overrideTriggerPath):0;
        let ovPUI: number | undefined = _.get(endpoint, `otherVessels.positionUpdateIntervals[${ovIDX}]`, undefined);
        let ovSUI: number | undefined = _.get(endpoint, `otherVessels.staticUpdateIntervals[${ovIDX}]`, undefined);
        app.debug(`${mvIDX} ${mvPUI} ${mvSUI}`);
        reportCount = reportPosition(
          udpSocket,
          endpoint,
          (mvPUI === undefined)?false:((heartbeatCount % mvPUI) === 0),
          (ovPUI === undefined)?false:((heartbeatCount % ovPUI) === 0)
        );
        endpoint.myVessel.positionReportCount += (reportCount % 10);
        endpoint.otherVessels.positionReportCount += Math.trunc(reportCount / 10);
        
        reportCount += reportStatic(
          udpSocket,
          endpoint,
          (mvSUI === undefined)?false:((heartbeatCount % mvSUI) === 0),
          (ovSUI === undefined)?false:((heartbeatCount % ovSUI) === 0)
        );
        endpoint.myVessel.staticReportCount += (reportCount % 10);
        endpoint.otherVessels.staticReportCount += Math.trunc(reportCount / 10);
      });
      heartbeatCount++;
    }, DEFAULT_HEARTBEAT_INTERVAL));
  }

  function reportPosition(socket: Socket, endpoint: Endpoint, reportSelf: boolean, reportOthers: boolean): number {
    var retval: number = 0;
    var aisClass: string;
    var aisProperties: AisEncodeOptions;
    var msg: any;

    pluginStatus.setStatus(`reporting ${reportSelf?'my vessel':''} ${reportOthers?'others':''} to '${endpoint.name}'`);
  
    Object.values(app.getPath('vessels')).forEach((vessel: any) => {
      try {
        if ((!reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI)) return(0);
        if ((!reportOthers) && (vessel.mmsi != pluginConfiguration.myMMSI)) return(0);
  
        aisProperties = { mmsi: vessel.mmsi };
        aisClass = (vessel.mmsi == pluginConfiguration.myMMSI)?pluginConfiguration.myAisClass:vessel.sensors.ais.class.value;

        if ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (endpoint.expiryInterval * 1000))) {
          aisProperties['accuracy'] = 0
          aisProperties['aistype'] = (aisClass == 'A')?1:18
          aisProperties['cog'] = radsToDeg(vessel.navigation.courseOverGroundTrue.value)
          try { aisProperties['hdg'] = vessel.navigation.headingTrue.value } catch(e) { aisProperties['hdg'] = 511 }
          aisProperties['lat'] = vessel.navigation.position.value.latitude
          aisProperties['lon'] = vessel.navigation.position.value.longitude
          aisProperties['own'] = (pluginConfiguration.myMMSI == vessel.mmsi)?1:0
          aisProperties['repeat'] = 3
          try { aisProperties['rot'] = vessel.navigation.rateOfTurn.value; } catch(e) { aisProperties['rot'] = 128 }
          aisProperties['sog'] = mpsToKn(vessel.navigation.speedOverGround.value)
          try { aisProperties['smi'] = decodeSMI(vessel.navigation.specialManeuver) } catch(e) { aisProperties['smi'] = 0 } 
          msg = new AisEncode(aisProperties)
          if ((msg) && (msg.valid)) {
            app.debug(`created position report for '${vessel.mmsi}' (${msg.nmea})`)
            sendReportMsg(socket, msg.nmea, endpoint)
            endpoint.lastReportTimestamp = Date.now();
            retval += ((reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI))?1:10
          } else {
            //app.debug(`error creating position report for '${vessel.mmsi}'`)
          }
        } else {
          //app.debug(`ignoring inactive vessel '${vessel.mmsi}'`)
        } 
      } catch(e) {
        if (e instanceof Error) {
          //app.debug(`error creating AIS sentence configuration for '${vessel.mmsi}' (${e.message})`)
        }
      }
    });
    return(retval);
  }

  function reportStatic(socket: Socket, endpoint: Endpoint, reportSelf: boolean = false, reportOthers: boolean = false): number {
    var retval: number = 0;
    var aisClass: string
    var aisProperties: any
    var msg: any, msgB: any
  
    Object.values(app.getPath('vessels')).forEach((vessel: any) => {
      try {
        if ((!reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI)) return(0);
        if ((!reportOthers) && (vessel.mmsi != pluginConfiguration.myMMSI)) return(0);

        aisProperties = { mmsi: vessel.mmsi }
        aisClass = (vessel.mmsi == pluginConfiguration.myMMSI)?pluginConfiguration.myAisClass:vessel.sensors.ais.class.value;

        if ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (endpoint.expiryInterval * 1000))) {
          aisProperties['callsign'] = ''
          try { aisProperties['cargo'] = vessel.design.aisShipType.value.id } catch(e) { aisProperties['cargo'] = 0 }
          try { aisProperties['destination'] = vessel.navigation.destination.commonName } catch(e) { aisProperties['destination'] = '' }
          try { aisProperties['dimA'] = vessel.sensors.ais.fromBow.value.toFixed(0) } catch(e) { aisProperties['dimA'] = 0 }
          try { aisProperties['dimB'] = (vessel.design.length.value.overall - vessel.sensors.gps.fromBow.value).toFixed(0) } catch(e) { aisProperties['dimB'] = 0 }
          try { aisProperties['dimC'] = (vessel.design.beam.value / 2 + vessel.sensors.gps.fromCenter.value).toFixed(0) } catch(e) { aisProperties['dimC'] = 0 }
          try { aisProperties['dimD'] = (vessel.design.beam.value / 2 - vessel.sensors.gps.fromCenter.value).toFixed(0) } catch(e) { aisProperties['dimD'] = 0 }
          try { aisProperties['draught'] = vessel.design.draft.value.maximum } catch(e) { aisProperties['draught'] = 0 }
          aisProperties['etaDay'] = 0
          aisProperties['etaHr'] = 0
          aisProperties['etaMin'] = 0
          aisProperties['etaMo'] = 0
          aisProperties['imo'] = ''
          aisProperties['repeat'] = 3
          try { aisProperties['shipname'] = vessel.name } catch(e) { aisProperties['shipname'] = '' }
          switch (aisClass) {
            case 'A':
              aisProperties['aistype'] = 5;
              msg = new AisEncode(aisProperties);
              if ((msg) && (msg.valid)) {
                app.debug(`created static data report for '${vessel.mmsi}' (${msg.nmea})`)
                sendReportMsg(socket, msg.nmea, endpoint);
              } else {
                app.debug(`error creating static data report for '${vessel.mmsi}'`)
              }
              retval += ((reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI))?1:10
              break;
            case 'B':
              aisProperties['aistype'] = 24;
              aisProperties['part'] = 0;
              msg = new AisEncode(aisProperties);
              if ((msg) && (msg.valid)) {
                aisProperties['part'] = 1;
                msgB = new AisEncode(aisProperties);
                if ((msgB) && (msgB.valid)) {
                  app.debug(`created static data report for '${vessel.mmsi}'`);
                  sendReportMsg(socket, msg.nmea, endpoint);
                  sendReportMsg(socket, msgB.nmea, endpoint);
                } else {
                  // app.debug(`error creating static data report for '${vessel.mmsi}' (Part 2 failed)`)
                }
              } else {
                // app.debug(`error creating static data report for '${vessel.mmsi}' (Part 1 failed)`)
              }
              endpoint.lastReportTimestamp = Date.now();
              retval += ((reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI))?1:10
              break;
            default:
              break;
          }          
        } else {
          // app.debug(`ignoring inactive vessel '${vessel.mmsi}'`)
        }
      } catch(e) {
        if (e instanceof Error) {
          // app.debug(`error creating AIS sentence configuration for '${vessel.mmsi}' (${e.message})`)
        }
      }
    });
    return(retval);
  }

  function sendReportMsg(socket: Socket, msg: string, endpoint: Endpoint) {
    pluginStatus.setStatus(`sending report to endpoint '${endpoint.name}'`);
    if (socket) {
      socket.send(msg + '\n', 0, msg.length + 1, endpoint.port, endpoint.ipAddress, (e: any) => {
        if (e instanceof Error) app.setPluginStatus(`send failure (${e.message})`)
      });
    } else {
      app.setPluginStatus(`Stopped: UDP port is no longer available`);
    }
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
              lastTransmission: (!endpoint.lastReportTimestamp)?'never':(new Date(endpoint.lastReportTimestamp)).toUTCString(),
              myVessel: {
                positionReportCount: endpoint.myVessel.positionReportCount,
                staticReportCount: endpoint.myVessel.staticReportCount
              },
              otherVessels: {
                positionReportCount: endpoint.otherVessels.positionReportCount,
                staticReportCount: endpoint.otherVessels.staticReportCount
              }
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
  expiryInterval: number,
  myVessel: {
   positionUpdateIntervals: number[],
   staticUpdateIntervals: number[],
   overrideTriggerPath: string
   positionReportCount: number,
   staticReportCount: number,
  },
  otherVessels: {
    positionUpdateIntervals: number[],
    staticUpdateIntervals: number[],
    overrideTriggerPath: string
    positionReportCount: 0,
    staticReportCount: 0
  },
  lastReportTimestamp: number | undefined
}

interface StatusResponse {
  ipAddress: string,
  port: number,
  lastTransmission: string,
  myVessel: {
    positionReportCount: number,
    staticReportCount: number
  },
  otherVessels: {
    positionReportCount: number,
    staticReportCount: number
  }
}

interface Dictionary<T> {
  [key: string]: T
}
