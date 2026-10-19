# ais-reporter

**ais-reporter** is a
[Signal K](https://www.signalk.org/)
plugin which pushes AIS data on *known vessels* to one or more user
specified UDP *endpoints*.
Known vessels in this context means the host ship and all AIS targets
from which data is currently being received.
An endpoint is any remote service capable of receiving AIS data over
UDP, typically a consolidation service like
[MarineTraffic](https://www.marinetraffic.com).

AIS reports for the host vessel can be issued even if the ship has no
AIS equipment: it is sufficient that the vessel's MMSI and position
are available on their default Signal K paths (`mmsi` and
`navigation.position`).

One particular use case for the plugin is publishing the host vessel
position in regions (like much of inland Europe) where consolidation
service base station coverage is sparse or non-exixstent.

The rates at which reports are issued for the host ship, AIS targets
and UDP enpoints can be independently configured and can be dynamically
adjusted in response to the navigation state of the host vessel as
reported on the Signal K `navigation.state` path.

## System requirements

If your Signal K system does not maintain the `navigation.state` path
then you may wish to install the
[signalk-autostate](https://github.com/meri-imperiumi/signalk-autostate)
plugin from the appstore.

## Plugin configuration

To operate at all the plugin's JSON configuration file
`~/.signalk/plugin-configuration-data/ais-reporter.json`
must be initialised using either Signal K's plugin configuration GUI
or a text editor.

The plugin configuration must contain an 'endpoints' array of objects
each of which defines a reporting endpoint.

The following properties can be applied globally or within each
endpoint definition.

*positionUpdateInterval* specifies the position update interval for all
vessels as either a time in minutes or an array of times in minutes.
A value of 0 minutes disables updates.

*staticUpdateInterval* specifies the static data update interval for
all vessels as either a time in minutes or an array of times in
minutes.
A value of 0 minutes disables updates.

*myPositionUpdateInterval* specifies the position update interval for
the 'self' vessel as either a time in minutes or an array of times in
minutes.
A value of 0 minutes disables updates.

*myStaticUpdateInterval* specifies the static data update interval for
the 'self' vessel as either a time in minutes or an array of times in
minutes.
A value of 0 minutes disables updates.

*navigationStateMap* specifies which state values on Signal K's
`navigation.state` path select which values from any array of update
intervals.

## Example configurations

### Example 1: report host vessel data to MarineTraffic.com

This example sends position and static AIS reports once every fifty-five
minutes when the host vessel is stationary and a position report once a
minute when the vessel is moving.
The `navigation.state` path must be active on the host system.
Increasing the stationary reporting interval much above 55 will cause
Marine Traffic to think that the reporting station has died.

```json
{
  "configuration": {
    "endpoints": [
      {
        "name": "marine-traffic",
        "ipAddress": "203.0.113.1",
        "port": 32123,
        "navigationStateMap": [ [ ], [ "sailing", "motoring" ] ],
        "myPositionUpdateInterval": [55,1],
        "myStaticUpdateInterval": 55
      }  
    ]  
  },  
  "enabled": true  
}
```

The *ipAddress* and *port* number used in the example are fakes.
You must subscribe with MarineTraffic.com as a reporting station
to obtain an IP address and service port number that act as your
station's reporting entry point.

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
        "navigationStateMap": [ [ ], [ "sailing", "motoring" ] ],
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

## Plugin API

A simple API is available at `/skServer/openapi/plugins/ais-reporter`.

## Author

Paul Reeve <*preeve_at_pdjr_dot_eu*>
