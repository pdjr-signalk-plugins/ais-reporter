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

const AisEncode = require("ggencoder").AisEncode;
const dgram = require("dgram");
const Log = require("./lib/signalk-liblog/Log.js");

const PLUGIN_ID = "pdjr-ais-reporter";
const PLUGIN_NAME = "pdjr-ais-reporter";
const PLUGIN_DESCRIPTION = "Report AIS data to remote UTP services.";
const PLUGIN_SCHEMA = {
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
    myaisclass: {
      type: 'string',
      title: 'My AIS transceiver class',
      oneOf: [
        { const: 'B', title: 'none' },
        { const: 'A', title: 'Class A' },
        { const: 'B', title: 'Class B' }
      ],
      default: 18
    }
  }
};
const PLUGIN_UISCHEMA = {};

module.exports = function (app) {
  var plugin = {};
  var udpSocket;
  var intervalIds = [];

  plugin.id = PLUGIN_ID;
  plugin.name = PLUGIN_NAME;
  plugin.description = PLUGIN_DESCRIPTION;
  plugin.schema = PLUGIN_SCHEMA;
  plugin.uiSchema = PLUGIN_UISCHEMA;
  plugin.log = new Log(plugin.id, { ncallback: app.setPluginStatus, ecallback: app.setPluginError });
  
  plugin.start = function(options, restartPlugin) {
    options.mymmsi = app.getSelfPath('mmsi');

    app.debug(`using configuration: ${JSON.stringify(plugin.options, null, 2)}`);

    udpSocket= dgram.createSocket('udp4');

    if ((options.endpoints) && (options.endpoints.length > 0)) {
      if (options.positionupdateinterval > 0) {
        intervalIds.push(setInterval(reportPositions, (options.positionupdateinterval * 1000), options));
      }
      if ((options.positionupdateinterval > 0) && (options.staticupdateinterval > 0)) {
        intervalIds.push(setInterval(reportStaticData, (options.staticupdateinterval * 1000), options));
      }
    }
    plugin.log.N("Connected to %d endpoint%s", options.endpoints.length, (options.endpoints.length == 1)?'':'s');
  }

  plugin.stop = function() {
	  intervalIds.forEach(id => clearInterval(id));
    intervalIds = [];
  }

  plugin.registerWithRouter = function(router) {
    //router.get('/keys', handleRoutes);
    //router.get('/digest/', handleRoutes);
    //router.get('/outputs/', handleRoutes);
    //router.get('/output/:name', handleRoutes);
    //router.patch('/suppress/:name', handleRoutes);
  }

  //plugin.getOpenApi = () => require("./resources/openApi.json");

  /********************************************************************
   * Report the position of an AIS target.
   */
  function reportPositions(options) {
    var aisClass;
    var aisProperties;
    var count = 0;
    var msg;

    app.getPath('vessels').forEach(vessel => {
      aisProperties = {};
      try {
        if ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (options.expiryinterval * 1000))) {
          try { aisClass = vessel.sensors.ais.class.value } catch(e) { aisClass = options.myaisclass }
          aisProperties['accuracy'] = 0;
          aisProperties['aistype'] = (aisClass == 'A')?1:18;
          aisProperties['cog'] = radsToDeg(vessel.navigation.courseOverGroundTrue.value);
          try { aisProperties['hdg'] = vessel.navigation.headingTrue.value } catch(e) { aisProperties['hdg'] = 511 }
          aisProperties['lat'] = vessel.navigation.position.value.latitude;
          aisProperties['lon'] = vessel.navigation.position.value.longitude;
          aisProperties['mmsi'] = parseInt(vessel.mmsi);
          aisProperties['own'] = (parseInt(options.mymmsi) == parseInt(vessel.mmsi))
          aisProperties['repeat'] = 3;
          try { aisProperties['rot'] = vessel.navigation.rateOfTurn.value; } catch(e) { aisProperties['rot'] = 128}
          aisProperties['sog'] = mpsToKn(vessel.navigation.speedOverGround.value);
          aisProperties['smi'] = 0;
          msg = new AisEncode(aisProperties);
          if ((msg) && (msg.valid)) {
            app.debug("created position report for '%s' (%s)", vessel.mmsi, msg.nmea);
            options.endpoints.forEach(endpoint => sendReportMsg(msg.nmea, endpoint.ipaddress, endpoint.port));
            count++;
          } else {
            app.debug("error creating position report for '%s'", vessel.mmsi);
          }
        } else {
          app.debug("ignoring inactive vessel '%s'" , vessel.mmsi);
        } 
      } catch(e) {
        app.debug("error creating AIS sentence configuration for '%s' (%s)", vessel.mmsi, e.message);
      }
    });
    plugin.log.N("Last sent %d position report%s to %d endpoint%s", count, (count == 1)?'':'s', options.endpoints.length, (options.endpoints.length == 1)?'':'s');
  }

  /********************************************************************
   * Report static data for an AIS target.
   */
  function reportStaticData(options) {
    var aisClass;
    var aisProperties;
    var count = 0;
    var msg, msgB;

    app.getPath('vessels').forEach(vessel => {
      aisProperties = {};
      try {
        if ((new Date(vessel.navigation.position.timestamp)).getTime() > (Date.now() - (options.expiryinterval * 1000))) {
          try { aisClass = vessel.sensors.ais.class.value } catch(e) { aisClass = options.myaisclass }
          aisProperties['callsign'] = '';
          try { aisProperties['cargo'] = vessel.design.aisShipType.value.id } catch(e) { aisProperties['cargo'] = 0 }
          try { aisProperties['destination'] = vessel.navigation.destination.commonName } catch(e) { aisProperties['destination'] = '' }
          try { aisProperties['dimA'] = vessel.sensors.ais.fromBow.value.toFixed(0) } catch(e) { aisProperties['dimA'] = 0 }
          try { aisProperties['dimB'] = (vessel.design.length.value.overall - vessel.sensors.gps.fromBow.value).toFixed(0) } catch(e) { aisProperties['dimB'] = 0 }
          try { aisProperties['dimC'] = (vessel.design.beam.value / 2 + vessel.sensors.gps.fromCenter.value).toFixed(0) } catch(e) { aisProperties['dimC'] = 0 }
          try { aisProperties['dimD'] = (vessel.design.beam.value / 2 - vessel.sensors.gps.fromCenter.value).toFixed(0) } catch(e) { aisProperties['dimD'] = 0 }
          try { aisProperties['draught'] = vessel.design.draft.value.maximum } catch(e) { aisProperties['draught'] = 0 }
          aisProperties['etaDay'] = 0;
          aisProperties['etaHr'] = 0
          aisProperties['etaMin'] = 0;
          aisProperties['etaMo'] = 0;
          aisProperties['imo'] = ''
          aisProperties['mmsi'] = parseInt(vessel.mmsi);
          aisProperties['repeat'] = 3
          try { aisProperties['shipname'] = vessel.name } catch(e) { aisProperties['shipname'] = '' }
          switch (aisClass) {
            case 'A':
              aisProperties['aistype'] = 5;
              msg = new AisEncode(aisProperties);
              if ((msg) && (msg.valid)) {
                app.debug("created static data report for '%s' (%s)", vessel.mmsi, msg.nmea);
                options.endpoints.forEach(endpoint => sendReportMsg(msg.nmea, endpoint.ipaddress, endpoint.port));
                count++;
              } else {
                app.debug("error creating static data report for '%s'", vessel.mmsi);
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
                  app.debug("created static data report for '%s'", vessel.mmsi);
                  options.endpoints.forEach(endpoint => sendReportMsg(msg.nmea, endpoint.ipaddress, endpoint.port));
                  options.endpoints.forEach(endpoint => sendReportMsg(msgB.nmea, endpoint.ipaddress, endpoint.port));
                  count++;
                } else {
                  app.debug("error creating static data report for '%s' (Part 2 failed)", vessel.mmsi);
                }
              } else {
                app.debug("error creating static data report for '%s' (Part 1 failed)", vessel.mmsi);
              }
              break;
            default:
              break;
          }          
        } else {
          app.debug("ignoring inactive vessel '%s'", vessel.mmsi);
        }
      } catch(e) {
        app.debug("error creating AIS sentence configuration for '%s' (%s)", vessel.mmsi, e.message);
      }
    });
    plugin.log.N("Last sent %d static data report%s to %d endpoint%s", count, (count == 1)?'':'s', options.endpoints.length, (options.endpoints.length == 1)?'':'s');
  }

  function sendReportMsg(msg, ipaddress, port) {
    if (udpSocket) {
      udpSocket.send(msg + '\n', 0, msg.length + 1, port, ipaddress, e => {
        if (e) plugin.log.E('send failure (%s)', e.message);
      });
    } else {
      plugin.log.E("UDP port is no longer available");
    }
  }
  
  function radsToDeg(radians) {
    return radians * 180 / Math.PI
  }
  
  function mpsToKn(mps) {
    return 1.9438444924574 * mps
  }

  return(plugin);
}
