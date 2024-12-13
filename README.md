# pdjr-ais-reporter

**pdjr-ais-reporter** is a
[Signal K](https://www.signalk.org/)
plugin which reports position and static data for the host ship and for
vessels detected over AIS to one or more UDP endpoints.
The plugin can be used to send vessel data to online AIS consolidation
services like
[MarineTraffic](https://www.marinetraffic.com).

The plugin can report position and static data for the 'self' vessel
requiring only that MMSI and vessel position are available on their
default Signal K paths of ```mmsi``` and ```navigation.position```
repectively.

On a vessel with an AIS receiver data on all nearby vessels known to
Signal K may be uploaded to the specified endpoints.

Reports are issued at a user configured rate to each defined endpoint
giving some control over Ethernet data and bandwidth use.

## Plugin configuration

Configuration of the plugin is simple with much flexibility of approach.
However, Signal K's dashboard plugin configuration interface translates
this flexibility into complexity making it easier to discuss configuration
in terms of the plugins's JSON configuration file.

Once you understand the JSON structure, you should be able to navigate
the plugin's configuration interface in the Signal K's dashboard with
ease.

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

This minimal configuration will report the position of all vessels known to
Signal K once every 5 minutes and static data once every 15 minutes.

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

The 'expiryInterval', 'positionUpdateInterval' and 'statusUpdateInterval'
properties are declared at the top-level of the configuration and apply to
all endpoints and all vessels.

All numeric values in a configuration specify a time period in minutes with a
zero value representing an infinite time period and essentially disabling any
associated behaviour.

The 'expiryInterval' property tells the plugin to disregard any vessel
whose position has not been updated in the last 15 minutes.
'positionUpdateInterval' and 'staticUpdateInterval' reporting intervals are
specified as separate properties since, at least for class 'B' reports, we
normally want to update position data more frequently than static data.
If the 'staticUpdateInterval' property is ommitted, then it assumes the
same value as the 'positionUpdateInterval' property.

### Differentiate 'self' from other vessels

Sometimes we want to treat host vessel reporting differently to the reporting
of other vessels whose data had been received over AIS.

One such scenario is when we want to report our own vessel but not any
others.
One way of achieving this is to set global default update intervals to
0 and then to override these settings for just our own ship.
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

On my ship I like to modify my position reporting intervals based upon whether
the ship is navigating or moored: a short interval when navigating so as to
record a good track and a long interval when moored (but frequently enough
that the reporting endpoint I use doesn't think I have gone off-line).

My ship reports the main engine ignition state via an NMEA switchbank
channel which appears in Signal K as the path `electrical.switches.bank.16.16.state`.
This path has the value 0 when engine ignition is OFF and 1 when it is
ON.

The plugin supports a simple value selection mechanism which uses the
value on a Signal K path as an index for selecting the reporting
interval to be used at any point in time.
To use this mechanism we need to specify our update intervals as a two
item array and the selection path as the value of the 'overrideTriggerPath'
property: the value at the zeroth position in the array will be used
when the ignition is OFF and the value at the first position in the
array will be used when the switch is ON.
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


## Required configuration properties

### UDP endpoints to report to (```endpoints```)
A list of service endpoints to which the plugin should send AIS
reports.
Each service endpoint is specified by the following required its IP address and the
number of its listening port.

Defaults to an empty list.

###

### Position update interval (s)
Optional array property whuch
The frequency at which position updates for active vessels should
be sent to endpoints, expressed as an interval in seconds.
A value of 0 disables all position and static reporting.

At the end of an update interval the most recent position report
received from each active vessel is transmitted to every endpoint.

Increasing this value will reduce the amount of data transmitted
over the host Internet connection at the cost of temporal accuracy
in position reporting.

Defaults to 120 (seconds).

### Static update interval (s)
The frequency at which static data updates for active vessels should
be sent to endpoints, expressed as an interval in seconds.
A value of 0 disables static data reporting.
A value less than **Position update interval** will be treated as
**Position update interval**.

Defaults to 300 (seconds).

### Ignore data older than (s)
The interval after which a vessel's data reports cease to be transmitted
after SignalK stops receiving AIS updates for the vessel.
This value determines what constitutes an 'active' vs. an 'inactive'
vessel.

Defaults to 900 (seconds).

### Report self?
Whether or not to report the host vessel.

Defaults to yes (true).

### Report others?
Whether or not to report vessels whose data has been received over AIS.

Defaults to no (false).

### My AIS transceiver class
The class of transceiver used on the host vessel (if any).

Defaults to 'none', although a value of 'none' will make the plugin
fake Class B position and status reports for the host vessel.

If you do have an AIS transceiver then you can specify its type
here.

## Author
Paul Reeve <preeve_at_pdjr_dot_eu>
