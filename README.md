# ais-reporter

**ais-reporter** is a
[Signal K](https://www.signalk.org/)
plugin which pushes AIS data on *known vessels* to one or more user
specified UDP *endpoints*.
Known vessels in this context means the host ship and all AIS targets
from which data is currently being received.
An endpoint is any remote service capable of receiving data over UDP,
typically a consolidation service like
[MarineTraffic](https://www.marinetraffic.com).

The AIS reporting method for the host vessel can be set to Class A
(message types 1 and 5), Class B (message types 18 and 24) or Class
B+ (message type 19) and reports can be issued even if the ship has
no installed AIS equipment.
As an absolute minimum the vessel's MMSI and position must be available
on their default Signal K paths (for more information on the Signal K
data used to generate AIS reports
[see below](#signal-k-data-used-to-generate-ais-messages)).

One particular use case for the plugin is publishing the host vessel
position in regions (like much of inland Europe) where consolidation
service base station coverage is sparse or non-existent.

The rates at which reports are issued for the host ship, AIS targets
and UDP enpoints can be independently configured and can be dynamically
adjusted in response to the navigation state of the host vessel as
reported on the Signal K `navigation.state` path.

## System requirements

To operate at all the plugin's JSON configuration file
`~/.signalk/plugin-configuration-data/ais-reporter.json`
must be initialised using either Signal K's plugin configuration GUI
or a text editor.

If your Signal K system does not already maintain the `navigation.state`
path then you may wish to install the
[signalk-autostate](https://github.com/meri-imperiumi/signalk-autostate)
plugin from the appstore.

## Plugin configuration

A
[valid configuration](./src/schema.json)
must contain an 'endpoints' array of objects each of which defines a
reporting endpoint.

The following properties can be applied globally or within each
endpoint definition.

*myAisReportClass* forces the type of position report that should
be issued for the host vessel to the associated endpoint(s) and if
specified must be one of 'A' (AIS report type 1), 'B' (AIS report
type 18) or 'B+' (AIS report type 19).
If not specified 'B' is assumed.

*positionUpdateInterval* specifies the position update interval for all
vessels as either a time in minutes or an array of times in minutes.
Defaults to 0 (disable updates).

*staticUpdateInterval* specifies the static data update interval for
all vessels as either a time in minutes or an array of times in
minutes.
Defaults to 0 (disable updates).

*myPositionUpdateInterval* specifies the position update interval for
the 'self' vessel as either a time in minutes or an array of times in
minutes.
Defaults to 0 (disable updates).

*myStaticUpdateInterval* specifies the static data update interval for
the 'self' vessel as either a time in minutes or an array of times in
minutes.
Defaults to 0 (disable updates).

*navigationStateMap* specifies which value in an update interval array
should be selected when a particular navigation state is active.
If, for whatever reason, the vessel's current navigation state is not
selected then the zeroth value in an update interval array is chosen.

## Example configurations

### Example 1: report host vessel data to MarineTraffic.com

This example sends position and static AIS reports once every fifty-five
minutes when the host vessel is stationary and a position report once a
minute when the vessel is moving (i.e. either sailing or motoring).
The `navigation.state` path must be active on the host system.
Increasing reporting intervals much above 55 minutes will cause Marine
Traffic to think that the reporting station has died.

```json
{
  "configuration": {
    "endpoints": [
      {
        "name": "marine-traffic",
        "ipAddress": "203.0.113.1",
        "port": 32123,
        "navigationStateMap": { "sailing": 1, "motoring": 1 },
        "myPositionUpdateInterval": [55,1],
        "myStaticUpdateInterval": 55
      }  
    ]  
  },  
  "enabled": true  
}
```

The *ipAddress* and *port* number used in this example are fakes.
You must subscribe with MarineTraffic.com as a reporting station to
obtain your own unique IP address/service port number.

### Example 2: report host vessel data and AIS targets

If you are feeling altruistic, then you can additionally report AIS
data received from target vessels seen by Signal K.

```json
{
  "configuration": {
    "endpoints": [
      {
        "name": "marine-traffic",
        "ipAddress": "203.0.113.1",
        "port": 32123,
        "navigationStateMap": { "sailing": 1, "motoring": 1 },
        "myPositionUpdateInterval": [55,1],
        "myStaticUpdateInterval": 55,
        "positionUpdateInterval": 5,
        "staticUpdateInterval": 5
      }  
    ]  
  },  
  "enabled": true  
}
```

### Example 3: report to a local endpoint

To make sure things are working as expected, you can add a local
endpoint to your configuration...

```json
      {
        "name": "test",
        "ipAddress": "127.0.0.1",
        "port": 12345,
        "navigationStateMap": { "sailing": 1, "motoring": 1 },
        "myAisReportClass": "A",
        "myPositionUpdateInterval": [2,1],
        "myStaticUpdateInterval": 2
      }
```

Which you can then monitor...

```bash
$> ~/.signalk/node_modules/ais-reporter/udp-listen.pl 12345
```

## Plugin API

A simple API is available at `/skServer/openapi/plugins/ais-reporter`.

## Signal K data used to generate AIS messages

`communication.callsignVhf`,
`design.aisShipType.value.id`,
`design.draft.current`,
`design.length.overall`,
`mmsi`,
`name`,
`navigation.courseOverGroundTrue`,
`navigation.destination.commonName`,
`navigation.destination.eta`,
`navigation.gnss.positionDilution`,
`navigation.headingTrue`,
`navigation.maneuver`,
`navigation.position`,
`navigation.rateOfTurn`,
`navigation.speedOverGround`,
`navigation.state`,
`registrations.imo`,
`sensors.gps.fromBow`,
`sensors.gps.fromCenter`            |

## Author

Paul Reeve <*preeve_at_pdjr_dot_eu*>
