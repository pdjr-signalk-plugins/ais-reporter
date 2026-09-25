# ais-reporter

**ais-reporter** is a
[Signal K](https://www.signalk.org/)
plugin which pushes AIS data on *known vessels* to one or more user
specified UDP *endpoints*.
Known vessels in this context means the 'self' ship and all vessels
from which AIS data is currently being received.
An endpoint is any remote service capable of receiving AIS data over
UDP, typically a consolidation service like
[MarineTraffic](https://www.marinetraffic.com).

The plugin can issue AIS reports for the 'self' vessel even if the
ship has no AIS equipment: it is sufficient that the vessel's MMSI and
position are available on their default Signal K paths (`mmsi` and
`navigation.position`).

On a ship with an AIS receiver the plugin can be configured to report
data on all vessels whose broadcasts are received and logged by Signal
K.

The rates at which reports are issued is user configurable by vessel
type (i.e. 'self' and 'other') and endpoint and can be dynamically
adjusted in response to values on arbitrart Signal K paths.
Together these measures give fine control over the granularity of the
data push and resource consumption on the host vessel's Internet
connection.

## Plugin configuration

To operate at all the plugin's JSON configuration file
`~/.signalk/plugin-configuration-data/ais-reporter.json`
must be initialised using either Signal K's plugin configuration GUI
or a text editor.

Some features of the configuration file are poorly supported by Signal
K's plugin configuration GUI and the following discussion assumes that
a text editor is being used to directly edit the JSON configuration.

### A minimal configuration

The plugin includes built-in defaults for most configuration properties
so a minimal plugin configuration requires only an *endpoints* array
containing at least one reporting endpoint specified in terms of its
*ipAddress* and service *port* (with maybe an optional descriptive
*name*).

> {  
> &nbsp;&nbsp;"configuration": {  
> &nbsp;&nbsp;&nbsp;&nbsp;"endpoints": [  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "Test endpoint",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ipAddress": "127.0.0.1",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"port": 12345  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;}  
> &nbsp;&nbsp;&nbsp;&nbsp;]  
> &nbsp;&nbsp;},  
> &nbsp;&nbsp;"enabled": true  
> }

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

#### Overriding default reporting intervals

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

*updateIntervalIndexPath* may be used to specify a Signal K path which
returns a value that can be used to index an interval array value.

These properties can be applied anywhere in the configuration file and
operate over the context in which they are defined.

### Configuration examples

#### Report 'self' vessel at different rate to AIS targets

> {  
> &nbsp;&nbsp;"configuration": {  
> &nbsp;&nbsp;&nbsp;&nbsp;"myPositionUpdateInterval": 1,  
> &nbsp;&nbsp;&nbsp;&nbsp;"myStaticUpdateInterval": 55,  
> &nbsp;&nbsp;&nbsp;&nbsp;"endpoints": [  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "Test endpoint",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ipAddress": "127.0.0.1",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"port": 12345  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;}  
> &nbsp;&nbsp;&nbsp;&nbsp;]  
> &nbsp;&nbsp;},  
> &nbsp;&nbsp;"enabled": true  
> }  

#### Report to two endpoints at different rates

> {  
> &nbsp;&nbsp;"configuration": {  
> &nbsp;&nbsp;&nbsp;&nbsp;"endpoints": [  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "Test endpoint",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateInterval": 1,  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateInterval": 1,  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ipAddress": "127.0.0.1",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"port": 12345  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;},  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "Marine Traffic",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateInterval": 5,  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateInterval": 20  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ipAddress": "*my-marine-traffic-ip*",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"port": *my-marine-traffic-port*  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;},  
> &nbsp;&nbsp;&nbsp;&nbsp;]  
> &nbsp;&nbsp;},  
> &nbsp;&nbsp;"enabled": true  
> }  

### Automatically modulate reporting intervals

On my ship I like to modify my position reporting intervals based upon
whether the ship is navigating or moored: using a short interval when
navigating so as to report a good track and a long interval when moored
so as to save data usage on my Internet connection.

In my case my ship reports the main engine ignition state via an NMEA
binary switchbank channel at 'electrical.switches.bank.16.16.state'
(0 says ignition off, 1 says ignition on) and the plugin uses this
value to select an appropriate value from the
*myPositionUpdateInterval* array.

> {  
> &nbsp;&nbsp;"configuration": {  
> &nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateInterval": 5,  
> &nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateInterval": 20,  
> &nbsp;&nbsp;&nbsp;&nbsp;"myPositionUpdateInterval": [55,1],  
> &nbsp;&nbsp;&nbsp;&nbsp;"myStaticUpdateInterval": 55,  
> &nbsp;&nbsp;&nbsp;&nbsp;"upateIntervalIndexPath": "electrical.switches.bank.16.16.state",  
> &nbsp;&nbsp;&nbsp;&nbsp;"endpoints": [  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "Marine Traffic",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ipAddress": "*my-marine-traffic-ip*",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"port": *my-marine-traffic-port*  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;}  
> &nbsp;&nbsp;&nbsp;&nbsp;]  
> &nbsp;&nbsp;},  
> &nbsp;&nbsp;"enabled": true  
> }

## Plugin API

The plugin presents an API on `/plugins/ais-reporter/status` which
returns some data on resources consumed by each endpoint.

```json
{
  "MarineTraffic": {
    "ipAddress": "-.-.--.---",
    "port": -----,
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
