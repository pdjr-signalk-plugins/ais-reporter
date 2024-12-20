# pdjr-ais-reporter

**pdjr-ais-reporter** is a
[Signal K](https://www.signalk.org/)
plugin which forwards AIS data on known vessels to one or more remote
UDP endpoints.
The plugin can be used to send AIS data to consolidation services like
[MarineTraffic](https://www.marinetraffic.com).

The plugin can issue AIS compliant reports for the 'self' vessel even
if the ship has no AIS equipment, requiring only that MMSI and vessel
position are available on their default Signal K paths of ```mmsi```
and ```navigation.position``` repectively.
On a ship with an AIS receiver the plugin can be configured to report
data on all vessels known to Signal K.

Reports are issued at a user configured rate to each defined endpoint
giving some control over the plugin's Ethernet resource consumption.

## Plugin configuration

It is easier to discuss plugin configuration in the context of the
plugin configuration JSON file.
Once you understand the JSON structure, you should be able to navigate
the plugin's configuration interface in the Signal K dashboard.

### A minimal configuration

The plugin includes built-in defaults for most configuration properties
and a minimal plugin configuration just requires the definition of at least
one reporting endpoint in terms of its IP address and service port.
For example:
> {  
> &nbsp;&nbsp;"configuration": {  
> &nbsp;&nbsp;&nbsp;&nbsp;"endpoints": [  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "My Endpoint",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ipAddress": "*target_ip_address*",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"port": *target_port_number*  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;}  
> &nbsp;&nbsp;&nbsp;&nbsp;]  
> &nbsp;&nbsp;},  
> &nbsp;&nbsp;"enabled": true  
> }

To use this simple configuration you must supply appropriate values for
*target_ip_address* and *target_port_number* and you may want to give the
'name' property a more meaningful value.

In fact, if you supply the values 'Local test endpoint', '127.0.0.1' and
12345 for the 'name', 'ipAddress' and 'port' properties then you can observe
the plugin in action by opening a terminal window on the Signal K server and
running the command `./udp_listen.pl 12345` from your system's plugin
installation folder.

This minimal configuration will report the position of all vessels
known to Signal K once every 5 minutes and associated static data once
every 15 minutes.

### Plugin defaults

As mentioned, the plugin uses some default property values and if we elaborate
the minimal configuration discussed above with these defaults then we can
get a clearer picture of how the configuration works.
> {  
> &nbsp;&nbsp;"configuration": {  
> &nbsp;&nbsp;&nbsp;&nbsp;"expiryInterval": 15,  
> &nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateInterval": 5,  
> &nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateInterval": 15,  
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

'expiryInterval', 'positionUpdateInterval' and 'staticUpdateInterval'
properties are declared at the top-level of the configuration and apply
to all endpoints and all vessels.

All numeric values in a configuration specify a time period in minutes
with a zero value representing an infinite time period and essentially
disabling any associated behaviour.

The 'expiryInterval' property tells the plugin to disregard any vessel
whose position has not been updated in the last 15 minutes.

'positionUpdateInterval' and 'staticUpdateInterval' are specified as
separate properties since, in line with the AIS protocol norms, we
probably want to report position data more frequently than static data.
If the 'staticUpdateInterval' property is ommitted, then the plugin
assumes the same value as the 'positionUpdateInterval' property.

### Differentiate 'self' from other vessels

Sometimes we want to treat host vessel reporting differently to the
reporting of other vessels whose data had been received over AIS.

The following example disables reporting of all vessels other than
the host ship by setting global default update intervals to 0 and then
override these settings for just our own ship.
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

### Automatically modulate reporting intervals

On my ship I like to modify my position reporting intervals based upon
whether the ship is navigating or moored: a short interval when
navigating so as to record a good track and a long interval when moored
so as to save data usage on my Internet connection.

The plugin allows this behaviour to be automated with the help of a
Signal K binary path value whose value is used as an index to select
ing the reporting interval to be used at any point in time.
To use this mechanism we need to specify our update intervals as an
(in this case) two item array: the value at the zeroth position in
the array will be used when the ignition is OFF and the value at the
first position in the array will be used when the switch is ON.

In my case my ship reports the main engine ignition state via an NMEA
switchbank channel at 'electrical.switches.bank.16.16.state'.
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
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateInterval": [55,55]  
> &nbsp;&nbsp;&nbsp;&nbsp;},  
> &nbsp;&nbsp;&nbsp;&nbsp;"otherVessels": {  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateInterval": [15,15],  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateIntervals": [15,15]  
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
