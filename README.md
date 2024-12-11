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

## Configuration examples

The plugin includes built-in defaults for most configuration options
and a minimal plugin configuration which leans on these defaults just
requires the specification of one or more endpoints in terms of the
IP address and ports to which data should be transmitted.

The properties displayed in bold in the following example must be supplied
to make a minimal working configuration; the normally displayed (non-bold)
properties show how the built-in defaults are applied to make a working
configuration.

> **{**  
> **&nbsp;&nbsp;"configuration": {**  
> &nbsp;&nbsp;&nbsp;&nbsp;"expiryInterval": 15,  
> &nbsp;&nbsp;&nbsp;&nbsp;"myVessel": {  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateIntervals": [15,0],  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"staticUpdateIntervals": [60,0]  
> &nbsp;&nbsp;&nbsp;&nbsp;},  
> &nbsp;&nbsp;&nbsp;&nbsp;"otherVessels": {  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"positionUpdateIntervals": [0,0]  
> &nbsp;&nbsp;&nbsp;&nbsp;},  
> **&nbsp;&nbsp;&nbsp;&nbsp;"endpoints": [**  
> **&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{**  
> **&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "MarineTraffic",**  
> **&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ipAddress": "xxx.xxx.xxx.xxx",**  
> **&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"port": nnnnn**  
> **&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;}**  
> **&nbsp;&nbsp;&nbsp;&nbsp;]**  
> **&nbsp;&nbsp;},**  
> **&nbsp;&nbsp;"enabled": true**  
> **}**  

All of the numeric values in a configuration specify a time period
in minutes with a zero value representing an infinite time period.

The 'expiryInterval' property tells the plugin to disregard any vessel
whose position has not been updated in the last 15 minutes.

The position and static data reporting intervals are specified as separate
properties since, at least for class 'B' reports, we normally want to update
position data more frequently than static data.
If the 'staticUpdateIntervals' property is ommitted, then it assumes the
same value as the 'positionUpdateIntervals' property.

Each update interval property value consists of a two element array in which
the first item defines the normal interval between successive report
transmissions and the second item defines the interval to be used when an
override (if any is specified) is active.

You can see that the configuration shown above will report the host
vessel's position every 15 minutes and its static data every 60 minutes, but
will not report information about other vessels (i.e. those received
over AIS).
This configuration does not specify an override, so the second item of
the interval arrays can be set to 0 since it is unused.

I use the following, more alaborate, configuration on my boat.
This reports to two endpoints: the MarineTraffic AIS consolidation service
and also local test facility.
Normal reporting frequencies are overriden by the value on a Signal K switch
path which reflects my engine ignition state: when the engine is running
I transmit my position once a minute, otherwise no so often.

> {  
> &nbsp;&nbsp;"configuration": {  
> &nbsp;&nbsp;&nbsp;&nbsp;"expiryInterval": 15,  
> &nbsp;&nbsp;&nbsp;&nbsp;"endpoints": [  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "MarineTraffic",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ipAddress": "xxx.xxx.xxx.xxx",  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"port": nnnnn,  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"myVessel": {  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"triggerOverridePath": "electrical.switches.bank.16.16.state",  
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
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"myVessel": {  
> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"triggerOverridePath": "electrical.switches.bank.16.16.state",  
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

plugin's built-in defaults expand this to:


Built in defaults can be overriden by specifying some alternative
top-level option values which will be applied to all endpoints.
Each endpoint configuration can include its own option values which
will override any other defaults.

### UDP endpoints to report to (```endpoints```)
A list of service endpoints to which the plugin should send AIS
reports.
Each service endpoint is specified by its IP address and the
number of its listening port.

Defaults to an empty list.

### Position update interval (s)
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
