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
const AisDecode = require("ggencoder").AisDecode;
const dgram = require("dgram");
const Log = require("./lib/signalk-liblog/Log.js");


const PLUGIN_ID = "pdjr-ais-reporter";
const PLUGIN_NAME = "pdjr-ais-reporter";
const PLUGIN_DESCRIPTION = "Report NMEA 0183 AIS data to remote UTP services.";
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
    var msg = null;
    var vessels = app.getPath('vessels');
    var aisProperties;
    var aisClass;
    var targetTimestamp;
    var count = 0;

    Object.keys(vessels).forEach(v => {
      aisProperties = {};
      try {
        // get timestamp in milliseconds of most recent position update.
        targetTimestamp = (new Date(vessels[v].navigation.position.timestamp)).getTime();
        // check update was within this reporting period.
        if (targetTimestamp > (Date.now() - (options.expiryinterval * 1000))) {
          try { aisClass = vessels[v].sensors.ais.class.value; } catch(e) { aisClass = options.myaisclass };
          switch (aisClass) {
            case 'B':
              aisProperties['aistype'] = 18;
              aisProperties['accuracy'] = 0;
              aisProperties['cog'] = radsToDeg(vessels[v].navigation.courseOverGroundTrue.value);
              aisProperties['hdg'] = 511; try { aisProperties['hdg'] = vessels[v].navigation.headingTrue.value } catch(e) {};
              aisProperties['lat'] = vessels[v].navigation.position.value.latitude;
              aisProperties['lon'] = vessels[v].navigation.position.value.longitude;
              aisProperties['mmsi'] = parseInt(vessels[v].mmsi);
              aisProperties['own'] = (parseInt(options.mymmsi) == parseInt(vessels[v].mmsi));
              aisProperties['repeat'] = 3;
              aisProperties['sog'] = mpsToKn(vessels[v].navigation.speedOverGround.value);
              break;
            case 'A':
              aisProperties['aistype'] = 1;
              aisProperties['cog'] = radsToDeg(vessels[v].navigation.courseOverGroundTrue.value);
              aisProperties['hdg'] = 511; try { aisProperties['hdg'] = vessels[v].navigation.headingTrue.value } catch(e) {};
              aisProperties['lat'] = vessels[v].navigation.position.value.latitude;
              aisProperties['lon'] = vessels[v].navigation.position.value.longitude;
              aisProperties['mmsi'] = parseInt(vessels[v].mmsi);
              //aisProperties['navstatus'] = 15; //vessels[v].navigation.state.value;
              aisProperties['own'] = (parseInt(options.mymmsi) == parseInt(vessels[v].mmsi));
              aisProperties['repeat'] = 3;
              aisProperties['rot'] = 128; try { aisProperties['rot'] = vessels[v].navigation.rateOfTurn.value; } catch(e) {};
              aisProperties['sog'] = mpsToKn(vessels[v].navigation.speedOverGround.value);
              aisProperties['smi'] = 0;
              break;
            default:
              break;
          }
          app.debug("encoding sentence type %d using configuration '%s'", aisProperties['aistype'], JSON.stringify(aisProperties));
          msg = new AisEncode(aisProperties);
          if ((msg) && (msg.valid)) {
            app.debug("encoded sentence as '%s'", msg.nmea);
            app.debug("which decodes to '%s'", JSON.stringify(new AisDecode(msg)));
            options.endpoints.forEach(endpoint => sendReportMsg(msg.nmea, endpoint.ipaddress, endpoint.port));
            count++;
          } else {
            app.debug("error encoding sentence");
          }
        } else {
          app.debug("not reporting stale data for '%s'", v);
        } 
      } catch(e) {
        app.debug("error processing sentence for '%s' (%s)", v, e.message);
      }
    });
    plugin.log.N("Last sent %d position report%s to %d endpoint%s", count, (count == 1)?'':'s', options.endpoints.length, (options.endpoints.length == 1)?'':'s');
  }

  /********************************************************************
   * Report static data for an AIS target.
   */
  function reportStaticData(options) {
    var msg = null;
    var vessels = app.getPath('vessels');

    Object.keys(vessels).forEach(vessel => {
      switch (vessel.sensors.ais.class || 'B') {
        case 'A' :
          msg = new AisEncode({
            aistype: 5,
            repeat: 0,
            mmsi: vessel.mmsi
          });
          break;
        case 'B' :
          msg = new AisEncode({
            aistype : 24,
            repeat: 0,
            mmsi: vessel.mmsi,
            shipname: vessel.name,
            cargo: '',
            callsign: '',
            dimA: (vessel.design.length.overall !== undefined) ? vessel.design.length.overall : 0,
            dimB: 0,
            dimC: (vessel.design.beam !== undefined) ? vessel.design.beam : 0,
            dimD: 0
          });
              break;
        default:
          break;
      }
      if (msg) options.endpoints.forEach(endpoint => sendReportMsg(msg, endpoint.ipaddress, endpoint.port));
    });
  }

  function sendReportMsg(msg, ipaddress, port) {
    if (udpSocket) {
      udpSocket.send(msg + '\n', 0, msg.length + 1, port, ipaddress, e => {
        if (e) plugin.log.E('send failure (%s)', e.message);
      });
    } else {
      app.debug("udp port not available");
    }
  }
  
  function radsToDeg(radians) {
    return radians * 180 / Math.PI
  }
  
  function mpsToKn(mps) {
    return 1.9438444924574 * mps
  }

  function getNavState(vessel) {
    var retval = 15; // not defined
    if ((vessel.navigation) && (vessel.navigation.state)) {

    }
    return(retval);
  }

  return(plugin);
}
