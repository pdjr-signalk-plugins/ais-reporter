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

One scenario is that we want to report our own vessel frequently enough to
document a good track when cruising and we don't want to report any other
vessel data at all.
There are a number of ways of achieving this and here is one.
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

I have a class B transceiver, so my 'static' AIS data really is static and
I can set the 'staticDataUpdate' interval at as very low level.

### Automatically modulate reporting intervals

On my ship I like to modify my position reporting intervals based upon whether
the ship is navigating or moored: a short interval when navigating so as to
record a good track and a long interval when moored (but frequently enough
that the reporting endpoint I use doesn't think I have gone off-line).

My ship reports the engine ignition state via an NMEA switchbank channel and
in Signal K, `electrical.switches.bank.16.16.state` reports 0 when engine
ignition is OFF and 1 when it is ON.

To explot this I use an array property value to specify two reporting intervals for
'positionUpdateInterval': the zeroth position in the array to be used when the
ignition is OFF and the first position to be used when the switch is ON.
> {  
> &nbsp;&nbsp;"configuration": {  
> &nbsp;&nbsp;&nbsp;&nbsp;"expiryInterval": 15,  
> &nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateInterval": 0,  
> &nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateInterval": 0,  
> &nbsp;&nbsp;&nbsp;&nbsp;"myVessel": {  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateInterval": [55,1],  
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


Each update interval property value consists of a two element array in which
the first item defines the normal interval between successive report
transmissions and the second item defines the interval to be used when an
override (if any is specified) is active.

You can see that the configuration shown above will report the host
vessel's position every 15 minutes and its static data every 60 minutes, but
will not report information about other vessels (i.e. those received
over AIS).
This configuration does not specify an override trigger, so the second item
of the interval arrays is unused.

I use the following, more elaborate, configuration on my boat.
This reports to two endpoints: the MarineTraffic AIS consolidation service
and a local test facility.
Normal reporting frequencies are overriden by the value on a Signal K switch
path which reflects my engine ignition state: when the engine is running
I transmit my position once a minute, otherwise not so often.

> {  
> &nbsp;&nbsp;"configuration": {  
> &nbsp;&nbsp;&nbsp;&nbsp;"expiryInterval": 15,  
> &nbsp;&nbsp;&nbsp;&nbsp;"endpoints": [  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "MarineTraffic",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ipAddress": "xxx.xxx.xxx.xxx",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"port": nnnnn,  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"triggerOverridePath": "electrical.switches.bank.16.16.state",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"myVessel": {  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateIntervals": [15,1],  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateIntervals": [60,60]  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;},  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"otherVessels": {  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateIntervals": [5,0],  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateIntervals": [15,0]  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;}  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;},  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "Test",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ipAddress": "127.0.0.1",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"port": 12345,  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"triggerOverridePath": "electrical.switches.bank.16.16.state",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"myVessel": {  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateIntervals": [2,1],  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateIntervals": [4,3]  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;},  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"otherVessels": {  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateIntervals": [5,0],  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateIntervals": [6,0]  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;}  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;}  
> &nbsp;&nbsp;&nbsp;&nbsp;]  
> &nbsp;&nbsp;},  
> &nbsp;&nbsp;"enabled": true  
> }  

Built in defaults can be overriden by specifying some alternative
top-level option values which will be applied to all endpoints.
Each endpoint configuration can include its own option values which
will override any top level definitions (including system defaults).

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
