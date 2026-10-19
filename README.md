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

Some features of the configuration file are poorly supported by Signal
K's plugin configuration GUI and the following discussion assumes that
a text editor is being used to directly edit the JSON configuration.

### Configuration properties

The reporting intervals described above can be overriden using the
properties described below.

*positionUpdateInterval* specifies the position update interval for all
vessels as either a time in minutes or an array of times in minutes.

*staticUpdateInterval* specifies the static data update interval for
all vessels as either a time in minutes or an array of times in
minutes.

*myPositionUpdateInterval* specifies the position update interval for
the 'self' vessel as either a time in minutes or an array of times in
minutes.

*myStaticUpdateInterval* specifies the static data update interval for
the 'self' vessel as either a time in minutes or an array of times in
minutes.

*navigationStateMap* used to specify which states on the Signal K's
`navigation.state` path select which values from an array of update
intervals.

These properties can be applied anywhere in the configuration file and
operate over the context in which they are defined.

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
        "name": "Marine Traffic",
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

This example will push AIS data to port 12345 on the Signal K host and
may be useful for checking and testing plugin operation.
A simple way to monitor port 12345 on the host computer is to open a
terminal window on the Signal K server and run the command
`~/.signalk/node_modules/ais-reporter/udp_listen.pl 12345`.

To report AIS data to a consolidation service provider (like Marine
Traffic) you must subscribe with the provider as a reporting station
and create an item in the *endpoints* array which uses the IP address
and service port number that they supply as your station's entry point.

### Default reporting intervals

The minimal configuration described above uses built in, global,
defaults to report the position of all vessels known to Signal K once
every 5 minutes and associated static data once every 15 minutes.


Note that consolidation services use the frequency of reporting as an
indicator of vessel presence; Marine Traffic for example seems to
expect reporting intervals of less than an hour or so.

### Configuration examples

#### Report 'self' vessel at different rate to AIS targets

```json
{  
  "configuration": {  
    "myPositionUpdateInterval": 1,  
    "myStaticUpdateInterval": 55,  
    "endpoints": [  
      {  
        "name": "Test",  
        "ipAddress": "127.0.0.1",  
        "port": 12345  
      }  
    ]  
  },  
  "enabled": true  
}
```  

#### Report to two endpoints at different rates

```json
{  
  "configuration": {  
    "endpoints": [  
      {  
        "name": "Test",  
        "ipAddress": "127.0.0.1",  
        "port": 12345,  
        "positionUpdateInterval": 1,  
        "staticUpdateInterval": 1  
      },  
      {  
        "name": "Marine Traffic",  
        "ipAddress": "203.0.113.1",  
        "port": 32123,  
        "positionUpdateInterval": 5,  
        "staticUpdateInterval": 20  
      }  
    ]  
  },  
  "enabled": true  
}
```  

### Automatically modulate reporting intervals

On my ship I like to modify position reporting intervals so that when
my ship is moving reports are made more frequently.
Values on the Signal K `navigation.state` path support this behaviour.

```json
{  
  "configuration": {  
    "positionUpdateInterval": 5,  
    "staticUpdateInterval": 20,  
    "myPositionUpdateInterval": [55,1],  
    "myStaticUpdateInterval": 55,  
    "navigationStateMap": [ [ ], [ "sailing", "motoring" ] ],  
    "endpoints": [  
      {  
        "name": "Marine Traffic",  
        "ipAddress": "203.0.113.1",  
        "port": 32123
      }  
    ]  
  },  
  "enabled": true  
}
```

## Plugin API

The plugin presents an API on `/plugins/ais-reporter/status` which
returns some data on resources consumed by each endpoint.

```json
{
  "MarineTraffic": {
    "ipAddress": "127.0.0.1",
    "port": 12345,
    "started": "2024-12-19T11:34:30.184Z",
    "totalBytesTransmitted": 382,
    "positionSelfBytesPerHour": 52,
    "positionOthersBytesPerHour": 0,
    "staticSelfBytesPerHour": 52,
    "staticOthersBytesPerHour": 0
  }
}
```

## Author

Paul Reeve <*preeve_at_pdjr_dot_eu*>
