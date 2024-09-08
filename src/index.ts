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

import { AisEncode, AisEncodeOptions } from 'ggencoder'
import * as dgram from 'dgram'

const PLUGIN_ID: string = "pdjr-ais-reporter";
const PLUGIN_NAME: string = "pdjr-ais-reporter";
const PLUGIN_DESCRIPTION: string = "Report AIS data to remote UTP services.";
const PLUGIN_SCHEMA: any = {
  type: 'object',
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
      default: true
    },
    myaisclass: {
      type: 'string',
      title: 'Own vessel AIS transceiver type',
      enum: [ '', 'A', 'B' ],
      enumNames: [ 'none', 'Class A', 'Class B' ],
      default: 'none'
    }
  }
}

const PLUGIN_UISCHEMA: any = {}

export default function  (app: any) {
  let udpSocket: dgram.Socket
  let intervalIds: number[] = []

  const plugin: any = {

    id: PLUGIN_ID,
    name: PLUGIN_NAME,
    description: PLUGIN_DESCRIPTION,
    schema: PLUGIN_SCHEMA,
    uiSchema: PLUGIN_UISCHEMA,
  
    start: function(options: any) {
      options.mymmsi = app.getSelfPath('mmsi')
      options.myaisclass = (options.myaisclass == '')?'B':options.myaisclass

      app.debug(`using configuration: ${JSON.stringify(options, null, 2)}`)

      udpSocket = dgram.createSocket('udp4')

      if ((options.endpoints) && (options.endpoints.length > 0)) {
        if (options.positionupdateinterval > 0) {
          intervalIds.push(Number(setInterval(reportPositions, (options.positionupdateinterval * 1000))));
        }
        if ((options.positionupdateinterval > 0) && (options.staticupdateinterval > 0)) {
          intervalIds.push(Number(setInterval(reportStaticData, (options.staticupdateinterval * 1000))));
        }
      }
      app.setPluginStatus(`Reporting to ${options.endpoints.length} endpoint(s)`);

      function reportPositions() {
        var aisClass: string
        var aisProperties: AisEncodeOptions
        var count: number = 0
        var msg: any
      
        Object.values(app.getPath('vessels')).forEach((vessel: any) => {
          if ((!options.reportself) && (vessel.mmsi == options.mymmsi)) return
          if ((!options.reportothers) && (vessel.mmsi != options.mymmsi)) return
          aisProperties = { mmsi: vessel.mmsi }
          try {
            if ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (options.expiryinterval * 1000))) {
              try { aisClass = vessel.sensors.ais.class.value } catch(e) { aisClass = options.myaisclass }
              aisProperties['accuracy'] = 0
              aisProperties['aistype'] = (aisClass == 'A')?1:18
              aisProperties['cog'] = radsToDeg(vessel.navigation.courseOverGroundTrue.value)
              try { aisProperties['hdg'] = vessel.navigation.headingTrue.value } catch(e) { aisProperties['hdg'] = 511 }
              aisProperties['lat'] = vessel.navigation.position.value.latitude
              aisProperties['lon'] = vessel.navigation.position.value.longitude
              aisProperties['own'] = (options.mymmsi == vessel.mmsi)?1:0
              aisProperties['repeat'] = 3
              try { aisProperties['rot'] = vessel.navigation.rateOfTurn.value; } catch(e) { aisProperties['rot'] = 128}
              aisProperties['sog'] = mpsToKn(vessel.navigation.speedOverGround.value)
              aisProperties['smi'] = 0
              msg = new AisEncode(aisProperties)
              if ((msg) && (msg.valid)) {
                app.debug(`created position report for '${vessel.mmsi}' (${msg.nmea})`)
                options.endpoints.forEach((endpoint: any) => sendReportMsg(msg.nmea, endpoint.ipaddress, endpoint.port))
                count++;
              } else {
                app.debug(`error creating position report for '${vessel.mmsi}'`)
              }
            } else {
              app.debug(`ignoring inactive vessel '${vessel.mmsi}'`)
            } 
          } catch(e) {
            if (e instanceof Error) {
              app.debug(`error creating AIS sentence configuration for '${vessel.mmsi}' (${e.message})`)
            }
          }
        })
        app.setPluginStatus(`Last sent ${count} position report(s) to ${options.endpoints.length} endpoint(s)`)
      }
      
      function reportStaticData() {
        var aisClass: string
        var aisProperties: any
        var count: number = 0
        var msg: any, msgB: any
      
        Object.values(app.getPath('vessels')).forEach((vessel: any) => {
          if ((!options.reportself) && (vessel.mmsi == options.mymmsi)) return;
          if ((!options.reportothers) && (vessel.mmsi != options.mymmsi)) return;
          aisProperties = {};
          try {
            if ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (options.expiryinterval * 1000))) {
              try { aisClass = vessel.sensors.ais.class.value } catch(e) { aisClass = options.myaisclass }
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
              aisProperties['mmsi'] = parseInt(vessel.mmsi)
              aisProperties['repeat'] = 3
              try { aisProperties['shipname'] = vessel.name } catch(e) { aisProperties['shipname'] = '' }
              switch (aisClass) {
                case 'A':
                  aisProperties['aistype'] = 5;
                  msg = new AisEncode(aisProperties);
                  if ((msg) && (msg.valid)) {
                    app.debug(`created static data report for '${vessel.mmsi}' (${msg.nmea})`)
                    options.endpoints.forEach((endpoint: any) => sendReportMsg(msg.nmea, endpoint.ipaddress, endpoint.port));
                    count++;
                  } else {
                    app.debug(`error creating static data report for '${vessel.mmsi}'`)
                  }
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
                      options.endpoints.forEach((endpoint: any) => sendReportMsg(msg.nmea, endpoint.ipaddress, endpoint.port));
                      options.endpoints.forEach((endpoint: any) => sendReportMsg(msgB.nmea, endpoint.ipaddress, endpoint.port));
                      count++;
                    } else {
                      app.debug(`error creating static data report for '${vessel.mmsi}' (Part 2 failed)`)
                    }
                  } else {
                    app.debug(`error creating static data report for '${vessel.mmsi}' (Part 1 failed)`)
                  }
                  break;
                default:
                  break;
              }          
            } else {
              app.debug(`ignoring inactive vessel '${vessel.mmsi}'`)
            }
          } catch(e) {
            if (e instanceof Error) {
              app.debug(`error creating AIS sentence configuration for '${vessel.mmsi}' (${e.message})`)
            }
          }
        })
        app.setPluginStatus(`Last sent ${count} static data report(s) to ${options.endpoints.length} endpoint(s)`)
      }

      function sendReportMsg(msg: string, ipaddress: string, port: number) {
        if (udpSocket) {
          udpSocket.send(msg + '\n', 0, msg.length + 1, port, ipaddress, (e: any) => {
            if (e instanceof Error) {
              app.setPluginStatus(`send failure (${e.message})`)
            }
          })
        } else {
          app.setPluginStatus(`UDP port is no longer available`)
        }
      }
      
    },

    stop: function() {
	    intervalIds.forEach((id: number) => clearInterval(id));
      intervalIds = [];
    },

    registerWithRouter: function(router: any) {
    //router.get('/keys', handleRoutes);
    //router.get('/digest/', handleRoutes);
    //router.get('/outputs/', handleRoutes);
    //router.get('/output/:name', handleRoutes);
    //router.patch('/suppress/:name', handleRoutes);
    }

    //plugin.getOpenApi = () => require("./resources/openApi.json");

  }

  return plugin
}

function radsToDeg(radians: number): number {
  return(radians * 180 / Math.PI)
}
  
function mpsToKn(mps: number): number {
  return(1.9438444924574 * mps)
}

