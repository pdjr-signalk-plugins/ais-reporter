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
    myvessel: {
      type: 'object',
      properties: {
        positionupdaterate: {
          type: 'number',
          title: 'My vessel position update rate (s)',
          default: 60
        },
        staticupdaterate: {
          type: 'number',
          title: 'My vessel static update rate (s)',
          default: 360
        }
      }
    },
    targets: {
      type: 'object',
      properties: {
        positionupdateinterval: {
          type: 'number',
          title: 'Target vessel position update rate (s)',
          default: 0
        },
        staticupdateinterval: {
          type: 'number',
          title: 'Target vessel static update rate (s)',
          default: 0
        }
      }
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

    app.debug(`using configuration: ${JSON.stringify(plugin.options, null, 2)}`);

    udpSocket= dgram.createSocket('udp4');

    if ((options.endpoints) && (options.endpoints.length > 0)) {
      //if (options.myvessel.positionupdateinterval > 0) intervalIds.push(setInterval(reportVesselPosition, (options.myvessel.positionupdateinterval * 1000), options));
      //if (options.myvessel.staticupdateinterval > 0) intervalIds.push(setInterval(reportVesselStatic, (options.myvessel.staticupdateinterval * 1000), options));
      if (options.targets.positionupdateinterval > 0) intervalIds.push(setInterval(reportTargetPosition, (options.targets.positionupdateinterval * 1000), options));
      //if (options.targets.staticupdateinterval > 0) intervalIds.push(setInterval(reportTargetStatic, (options.targets.staticupdateinterval * 1000), options));
    }
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

  function reportVesselPosition(options) {

  }

  function reportVesselStatic(options) {

  }
  
  /********************************************************************
   * Report the position of an AIS target.
   */
  function reportTargetPosition(options) {
    var msg = null;
    var vessels = app.getPath('vessels');
    var aisProperties;

    Object.keys(vessels).forEach(vessel => {
      aisProperties = {};
      try {
        if ((new Date(vessels[vessel].navigation.position.timestamp)).getTime() > (Date.now() - (options.targets.positionupdateinterval * 1000))) {
          aisProperties['aistype'] = (vessels[vessel].sensors.ais.class.value == 'A') ? 1 : 18;
          aisProperties['repeat'] = 0;
          aisProperties['mmsi'] = vessels[vessel].mmsi;
          aisProperties['smi'] = Math.floor((new Date(vessels[vessel].navigation.position.timestamp)).getTime() / 1000);
          aisProperties['lon'] = vessels[vessel].navigation.position.value.longitude;
          aisProperties['lat'] = vessels[vessel].navigation.position.value.latitude;
          aisProperties['accuracy'] = 0;
          aisProperties['sog'] = mpsToKn(vessels[vessel].navigation.speedOverGround.value);
          aisProperties['cog'] = radsToDeg(vessels[vessel].navigation.courseOverGroundTrue.value);
          //plugin.log.N("AIS props: %s", JSON.stringify(aisProperties));   
          if (msg = new AisEncode(aisProperties)) {
            if (msg.valid) {
              options.endpoints.forEach(endpoint => sendReportMsg(msg.nmea, endpoint.ipaddress, endpoint.port));
            }
          }
        }    
      } catch(e) {
        app.debug('Error making datagram (%s)', e.message);
      }
    });
  }

  /********************************************************************
   * Report static data for an AIS target.
   */
  function reportTargetStatic(options) {
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
      app.debug("Sending message: %s", msg);
      udpSocket.send(msg + '\n', 0, msg.length + 1, port, ipaddress, err => {
        if (err) {
          app.debug('Failed to send report message (%s)', err)
        }
      });
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
