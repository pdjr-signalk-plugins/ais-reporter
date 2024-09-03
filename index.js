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
const Log = require("signalk-liblog/Log.js");
const App = require('signalk-libapp/App.js');


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
          title: 'My vessel position update rate (s)',
          default: 0
        },
        staticupdateinterval: {
          type: 'number',
          title: 'My vessel static update rate (s)',
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
  plugin.app = new App(app);
  plugin.log = new Log(plugin.id, { ncallback: app.setPluginStatus, ecallback: app.setPluginError });
  
  plugin.start = function(options, restartPlugin) {

    app.debug(`using configuration: ${JSON.stringify(plugin.options, null, 2)}`);

    udpSocket= dgram.createSocket('udp4');

    if (plugin.options.endpoints) {
      if (options.targets.positionupdateinterval > 0) intervalIds.push(setInterval(reportPosition, (options.targets.positionupdaterate * 1000)));
      if (options.targets.staticupdateinterval > 0) intervalIds.push(setInterval(reportStatic, (options.targets.staticupdateinterval * 1000)));
    }
  }

  plugin.stop = function() {
	  intervalIds.forEach(id => clearInterval(id));
    intervalIds = [];
  }

  plugin.registerWithRouter = function(router) {
    router.get('/keys', handleRoutes);
    router.get('/digest/', handleRoutes);
    router.get('/outputs/', handleRoutes);
    router.get('/output/:name', handleRoutes);
    router.patch('/suppress/:name', handleRoutes);
  }

  plugin.getOpenApi = () => require("./resources/openApi.json");

  function reportPosition() {
    var msg = null;
    var vessels = app.getPath('vessels');

    vessels.keys.foreach(vessel => {
      switch (vessel.sensor.ais.class) {
        case 'A': 
          msg = new AisEncode({
            aistype: 1,
            repeat: 0,
            mmsi: vessel.mmsi,
            sog: (vessel.speedOverGround !== undefined) ? mpsToKn(vessel.speedOverGround) : undefined,
            accuracy: 0, // 0 = regular GPS, 1 = DGPS
            lon: vessel.navigation.position.longitude,
            lat: vessel.navigation.position.latitude,
            cog: (vessel.navigation.courseOverGroundTrue !== undefined) ? radsToDeg(vessel.navigation.courseOverGroundTrue) : undefined
          });
          break;
        case 'B':
          msg = new AisEncode({
            aistype: 18,
            repeat: 0,
            mmsi: vessel.mmsi,
            sog: (vessel.speedOverGround !== undefined) ? mpsToKn(vessel.speedOverGround) : undefined,
            accuracy: 0, // 0 = regular GPS, 1 = DGPS
            lon: vessel.navigation.position.longitude,
            lat: vessel.navigation.position.latitude,
            cog: (vessel.navigation.courseOverGroundTrue !== undefined) ? radsToDeg(vessel.navigation.courseOverGroundTrue) : undefined
          });
          break;
        default:
          break;
      }
      if (msg) options.endpoints.forEach(endpoint => sendReportMsg(msg, endpoint.ipaddress, endpoint.port));
    });

  }

  function reportStatic() {
    var msg = null;
    var vessels = app.getPath('vessels');

    vessels.keys.forEach(vessel => {
      switch (vessel.sensor.ais.class) {
        case 'A' :
          break;
        case 'B' :
          msg = new AisEncode({
            aistype : 24,
            repeat: 0,
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
      udpSocket.send(msg + '\n', 0, msg.length + 1, port, ipaddress, err => {
        if (err) {
          Log.E('Failed to send report (%s)', err)
        }
      })
    }
  }

  return(plugin);
}