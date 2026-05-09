# ais-reporter

**ais-reporter** is a
[Signal K](https://www.signalk.org/)
plugin which forwards AIS data on *known vessels* to one or more
user specified UDP *endpoints*.
Known vessels in this context means the 'self' ship and/or all
vessels from which AIS data is currently being received.
An endpoint is any remote service capable of receiving AIS data
over UDP, typically a consolidation service like
[MarineTraffic](https://www.marinetraffic.com).

The plugin can issue AIS reports for the 'self' vessel even if the ship
has no AIS equipment: it is sufficient that the vessel's MMSI and position
are available on their default Signal K paths (`mmsi` and `navigation.position`).

On a ship with an AIS receiver the plugin can be configured to report
data on all vessels whose broadcasts are received and logged by Signal K.

Reports are issued at a user configured rate to each defined endpoint
and reporting of the 'self' vessel can be configured differently to
that of other vessels giving some control over resource consumption on
the host vessel's Ethernet connection.

## Plugin configuration

This section discusses plugin configuration by considering the format of
the plugin's JSON configuration file.
Some of the JSON features used in the configuration are not supported by
Signal K's plugin configuration GUI and you must create and/or update the
configuration by using your favourite text editor to create or modify the
plugin configuration file at `~/.signalk/plugin-configuration-data/ais-reporter.json`.

### A minimal configuration

The plugin includes built-in defaults for most configuration properties
and a minimal plugin configuration just requires the specification of at least
one reporting endpoint in terms of its IP address and service port.

To report AIS data to a consolidation service provider (like Marine Traffic),
you must subscribe with the provider and use the IP address and service port
number that they supply.

To report AIS data to a local UDP socket for testing purposes you can use the
values '127.0.0.1' and 12345 and you can then observe the plugin in action by
monitoring this port.
A simple way to monitor port 12345 on the host computer is to open a terminal
window on the Signal K server and run the command
`/.signalk/node_modules/ais-reporter/udp_listen.pl 12345`.

For example:
> {  
> &nbsp;&nbsp;"configuration": {  
> &nbsp;&nbsp;&nbsp;&nbsp;"endpoints": [  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "Test Endpoint",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ipAddress": "127.0.0.1",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"port": 12345  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;}  
> &nbsp;&nbsp;&nbsp;&nbsp;]  
> &nbsp;&nbsp;},  
> &nbsp;&nbsp;"enabled": true  
> }

### Plugin defaults

The minimal configuration described above will report the position of all
vessels known to Signal K once every 5 minutes and associated static data
once every 15 minutes.
Received AIS data is expired after 15 minutes and no longer transmitted to
the upstream host.

These default timings can be overriden by specifying one or more of
*expiryInterval*, *positionUpdateInterval* and *staticUpdateInterval* at
the top-level of the plugin configuration.
For example:
> {  
> &nbsp;&nbsp;"configuration": {  
> &nbsp;&nbsp;&nbsp;&nbsp;"expiryInterval": 10,  
> &nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateInterval": 10,  
> &nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateInterval": 20,  
> &nbsp;&nbsp;&nbsp;&nbsp;"endpoints": [  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "Local test endpoint",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ipAddress": "127.0.0.1",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"port": 12345  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;}  
> &nbsp;&nbsp;&nbsp;&nbsp;]  
> &nbsp;&nbsp;},  
> &nbsp;&nbsp;"enabled": true  
> }  

All numeric values in a configuration specify a time period in minutes
with a zero value representing an infinite time period and essentially
disabling any associated behaviour.

The 'expiryInterval' property tells the plugin to disregard any vessel
from which an AIS position update has not been received in the specified
number of minutes.

'positionUpdateInterval' and 'staticUpdateInterval' are specified as
separate properties since, in line with the AIS protocol norms, we
probably want to report position data more frequently than static data.
If the 'staticUpdateInterval' property is omitted, then the plugin
assumes the same value as the 'positionUpdateInterval' property.

### Differentiate 'self' from other vessels

Sometimes we want to report our host vessel differently to the
reporting of other vessels whose data had been received over AIS.

The following example disables reporting of all vessels other than
the host ship by setting global default update intervals to 0 and then
overriding these settings for just our own ship.
> {  
> &nbsp;&nbsp;"configuration": {  
> &nbsp;&nbsp;&nbsp;&nbsp;"expiryInterval": 15,  
> &nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateInterval": 0,  
> &nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateInterval": 0,  
> &nbsp;&nbsp;&nbsp;&nbsp;"myVessel": {  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateInterval": 1,  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateInterval": 55  
> &nbsp;&nbsp;&nbsp;&nbsp;},  
> &nbsp;&nbsp;&nbsp;&nbsp;"endpoints": [  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "Local test endpoint",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ipAddress": "127.0.0.1",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"port": 12345  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;}  
> &nbsp;&nbsp;&nbsp;&nbsp;]  
> &nbsp;&nbsp;},  
> &nbsp;&nbsp;"enabled": true  
> }

### Automatically modulating reporting intervals

On my ship I like to modify my position reporting intervals based upon
whether the ship is navigating or moored: a short interval when
navigating so as to record a good track and a long interval when moored
so as to save data usage on my Internet connection.

The plugin allows this behaviour to be automated by using the value of a
Signal K path as an index to select the required reporting interval at
any point in time.
To use this mechanism we need to specify our update intervals as an
array with as many items as distinct values returned by the selector.

In my case my ship reports the main engine ignition state via an NMEA
switchbank channel at 'electrical.switches.bank.16.16.state' and so
operates with index values 0 (ignition OFF) and 1 (ignition ON).
> {  
> &nbsp;&nbsp;"configuration": {  
> &nbsp;&nbsp;&nbsp;&nbsp;"expiryInterval": 15,  
> &nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateInterval": 0,  
> &nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateInterval": 0,  
> &nbsp;&nbsp;&nbsp;&nbsp;"myVessel": {  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateInterval": [55,1],  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateInterval": 55,  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"upateIntervalSelector": "electrical.switches.bank.16.16.state"  
> &nbsp;&nbsp;&nbsp;&nbsp;},  
> &nbsp;&nbsp;&nbsp;&nbsp;"endpoints": [  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "Local test endpoint",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ipAddress": "127.0.0.1",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"port": 12345  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;}  
> &nbsp;&nbsp;&nbsp;&nbsp;]  
> &nbsp;&nbsp;},  
> &nbsp;&nbsp;"enabled": true  
> }

### My current production configuration

> {  
> &nbsp;&nbsp;"configuration": {  
> &nbsp;&nbsp;&nbsp;&nbsp;"expiryInterval": 15,  
> &nbsp;&nbsp;&nbsp;&nbsp;"updateIntervalSelector": "electrical.switches.bank.16.16.state",  
> &nbsp;&nbsp;&nbsp;&nbsp;"myVessel": {  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateInterval": [15,1],  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateInterval": 55  
> &nbsp;&nbsp;&nbsp;&nbsp;},  
> &nbsp;&nbsp;&nbsp;&nbsp;"otherVessels": {  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateInterval": 15,  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateIntervals": 15  
> &nbsp;&nbsp;&nbsp;&nbsp;},  
> &nbsp;&nbsp;&nbsp;&nbsp;"endpoints": [  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "MarineTraffic",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ipAddress": "*endpoint_ip_address*",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"port": *endpoint_port_number*,  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;},  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "Test",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ipAddress": "127.0.0.1",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"port": 12345,  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;}  
> &nbsp;&nbsp;&nbsp;&nbsp;]  
> &nbsp;&nbsp;},  
> &nbsp;&nbsp;"enabled": true  
> }  

## Plugin API

The plugin presents an API on `/plugins/ais-reporter/status` which
returns some data on resources consumed by each endpoint.
```
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
