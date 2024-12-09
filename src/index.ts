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

module.exports = function(app: any) {
  var pluginConfiguration: PluginConfiguration;
  var pluginStatus: PluginStatus;
  var udpSocket: Socket;
  var unsubscribes: (() => void)[];

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
          udpSocket = createSocket('udp4');
          startReporting(pluginConfiguration);
          unsubscribes = startOverrideCallbacks(pluginConfiguration);
        } else {
          pluginStatus.setDefaultStatus('Stopped: no configured endpoints');
        }
      } catch(e: any) {
        pluginStatus.setDefaultStatus('Stopped: configuration error');
        app.setPluginError(e.message);
      }
    },

    stop: function() {
      unsubscribes.forEach((f) => f());
      pluginConfiguration.endpoints.forEach((endpoint) => {
        clearInterval(endpoint.myVessel.positionTimeout);
        clearInterval(endpoint.myVessel.staticTimeout);
        clearInterval(endpoint.otherVessels.positionTimeout);
        clearInterval(endpoint.otherVessels.staticTimeout);
      });
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
          positionTimeout: undefined,
          staticTimeout: undefined,
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
          positionTimeout: undefined,
          staticTimeout: undefined,
          positionReportCount: 0,
          staticReportCount: 0
        },
        lastReportTimestamp: undefined,
      }
      pluginConfiguration.endpoints?.push(endpoint);
    });
    return(pluginConfiguration);
  }

  function startReporting(pluginConfiguration: PluginConfiguration) {
    pluginConfiguration.endpoints.forEach((endpoint) => {
      var v: number; // index selecting default or override intervals
      var positionUpdateInterval: number; // position update interval (as selected by v)
      var staticUpdateInterval: number; // static data update interval (as selected by v)

      v = (endpoint.myVessel.overrideTriggerPath)?app.getSelfPath(endpoint.myVessel.overrideTriggerPath):0;
      positionUpdateInterval = _.get(endpoint, `myVessel.positionUpdateIntervals[${v}]`, 0) * 1000;
      staticUpdateInterval = _.get(endpoint, `myVessel.staticUpdateIntervals[${v}]`, 0) * 1000;
      if (positionUpdateInterval) {
        endpoint.myVessel.positionTimeout = setInterval(() => {
          endpoint.myVessel.positionReportCount += reportPosition(udpSocket, endpoint, true, false);
        }, positionUpdateInterval);
      }
      if (staticUpdateInterval) {
        endpoint.myVessel.staticTimeout = setInterval(() => {
          endpoint.myVessel.staticReportCount += reportStatic(udpSocket, endpoint, true, false);
        }, staticUpdateInterval);
      }

      v = (endpoint.otherVessels.overrideTriggerPath)?app.getSelfPath(endpoint.otherVessels.overrideTriggerPath):0;
      positionUpdateInterval = _.get(endpoint, `otherVessels.positionUpdateIntervals[${v}]`, 0) * 1000;
      staticUpdateInterval = _.get(endpoint, `otherVessels.staticUpdateIntervals[${v}]`, 0) * 1000;
      if (positionUpdateInterval) {
        endpoint.otherVessels.positionTimeout = setInterval(() => {
          endpoint.otherVessels.positionReportCount += reportPosition(udpSocket, endpoint, false, true);
        }, positionUpdateInterval);
      }
      if (staticUpdateInterval) {
        endpoint.otherVessels.staticTimeout = setInterval(() => {
          endpoint.otherVessels.staticReportCount += reportStatic(udpSocket, endpoint, false, true);
        }, staticUpdateInterval);
      }     
    });
  }

  function startOverrideCallbacks(pluginConfiguration: PluginConfiguration): (() => void)[] {
    var retval: (() => void)[] = pluginConfiguration.endpoints.reduce((a: any, endpoint) => {
      if (_.get(endpoint, 'myVessel.overrideTriggerPath')) { // We have an override
        var stream: EventStream<number> = app.streambundle.getSelfStream(_.get(endpoint, 'myVessel.overrideTriggerPath'));
        a.push(stream.skipDuplicates().onValue((v) => {
          let positionUpdateInterval = _.get(endpoint, `myVessel.positionUpdateIntervals[${v}]`, 0) * 1000;
          let staticUpdateInterval = _.get(endpoint, `myVessel.staticUpdateIntervals[${v}]`, 0) * 1000;
          clearInterval(endpoint.myVessel.positionTimeout); // stop current timer
          clearInterval(endpoint.myVessel.staticTimeout); // stop current timer
          if (positionUpdateInterval) {
            endpoint.myVessel.positionTimeout = setInterval(() => {
              endpoint.myVessel.positionReportCount += reportPosition(udpSocket, endpoint, true, false);
              pluginStatus.setStatus(`updating position report interval for endpoint '${endpoint.name}'`);
            }, positionUpdateInterval);
          }
          if (staticUpdateInterval) {
            endpoint.myVessel.staticTimeout = setInterval(() => {
              endpoint.myVessel.staticReportCount += reportStatic(udpSocket, endpoint, true, false);
              pluginStatus.setStatus(`updating static data report interval for endpoint '${endpoint.name}'`);
            }, staticUpdateInterval);
          }
        }));
      }
      if (_.get(endpoint, 'otherVessels.overrideTriggerPath')) { // We have an override
        var stream: EventStream<number> = app.streambundle.getSelfStream(_.get(endpoint, 'otherVessels.overrideTriggerPath'));
        a.push(stream.skipDuplicates().onValue((v) => {
          let positionUpdateInterval = _.get(endpoint, `otherVessels.positionUpdateIntervals[${v}]`, 0) * 1000;
          let staticUpdateInterval = _.get(endpoint, `otherVessels.staticUpdateIntervals[${v}]`, 0) * 1000;
          clearInterval(endpoint.otherVessels.positionTimeout); // stop current timer
          clearInterval(endpoint.otherVessels.staticTimeout); // stop current timer
          if (positionUpdateInterval) {
            endpoint.otherVessels.positionTimeout = setInterval(() => {
              endpoint.otherVessels.positionReportCount += reportPosition(udpSocket, endpoint, false, true);
              pluginStatus.setStatus(`updating position report interval for endpoint '${endpoint.name}'`);
            }, positionUpdateInterval);
          }
          if (staticUpdateInterval) {
            endpoint.otherVessels.staticTimeout = setInterval(() => {
              endpoint.otherVessels.staticReportCount += reportStatic(udpSocket, endpoint, false, true);
              pluginStatus.setStatus(`updating static data report interval for endpoint '${endpoint.name}'`);
            }, staticUpdateInterval);
          }
        }));
      }
      return(a);
    }, []);
    return(retval);
  }

  function reportPosition(socket: Socket, endpoint: Endpoint, reportSelf: boolean = false, reportOthers: boolean = false): number {
    var retval: number = 0;
    var aisClass: string;
    var aisProperties: AisEncodeOptions;
    var msg: any;
  
    Object.values(app.getPath('vessels')).forEach((vessel: any) => {
      try {
        if ((!reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI)) return;
        if ((!reportOthers) && (vessel.mmsi != pluginConfiguration.myMMSI)) return;

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
            retval++;
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
        if ((!reportSelf) && (vessel.mmsi == pluginConfiguration.myMMSI)) return
        if ((!reportOthers) && (vessel.mmsi != pluginConfiguration.myMMSI)) return

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
              retval++;
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
              retval++;
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
   positionTimeout: NodeJS.Timeout | undefined,
   staticUpdateIntervals: number[],
   staticTimeout: NodeJS.Timeout | undefined,
   overrideTriggerPath: string
   positionReportCount: number,
   staticReportCount: number,
  },
  otherVessels: {
    positionUpdateIntervals: number[],
    positionTimeout: NodeJS.Timeout | undefined,
    staticUpdateIntervals: number[],
    staticTimeout: NodeJS.Timeout | undefined,
    overrideTriggerPath: string
    positionReportCount: 0,
    staticReportCount: 0
  },
  lastReportTimestamp: number | undefined,
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
