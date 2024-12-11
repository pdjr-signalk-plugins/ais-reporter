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

For example.

> {  
>   "configuration": {  
>     "endpoints": [  
>       {  
>         "name": "MarineTraffic",  
>         "ipAddress": "xxx.xxx.xxx.xxx",  
>         "port": nnnnn  
>       }  
>     ]  
>   },  
>   "enabled": true  
> }  

A configuration like that shown above will report the host vessel's
position every 15 minutes and its static data every 60 minutes, but
will not report information about other vessels (i.e. those received
over AIS).
Expanding this minimal configuration with the implicit system default
values shows the configuration as:
```
{
  "configuration": {
    "expiryInterval": 15,
    "myVessel": {
      "positionUpdateIntervals": [15,0],
      "staticUpdateIntervals": [60,0]
    },
    "otherVessels": {
      "positionUpdateIntervals": [0,0],
      "staticUpdateIntervals": [0,0]
    },
    "endpoints": [
      {
        "name": "MarineTraffic",
        "ipAddress": "xxx.xxx.xxx.xxx",
        "port": nnnnn
      }
    ]
  },
  "enabled": true
}
```

## A more elaborate configuration

All of the numeric values in a configuration specify a time period
in minutes with a zero value representing a disabled state.

Any or all of the 'expiryInterval', 'myVessel' and 'otherVessels'
properties can be expressed as properties of an endpoint, overriding
any global defaults defined at the top level of the configuration.

I use the following configuration which supports reporting to an
Internet AIS traffic site and a local test facility.
```
{
  "configuration": {
    "expiryInterval": 15,
    "endpoints": [
      {
        "name": "MarineTraffic",
        "ipAddress": "xxx.xxx.xxx.xxx",
        "port": nnnnn,
        "myVessel": {
          "triggerOverridePath": "electrical.switches.bank.16.16.state",
          "positionUpdateIntervals": [15,1],
          "staticUpdateIntervals": [60,60]
        },
        "otherVessels": {
          "positionUpdateIntervals": [5,0],
          "staticUpdateIntervals": [15,0]
        }
      }
      {
        "name": "Test",
        "ipAddress": "127.0.0.1",
        "port": 12345,
        "myVessel": {
          "triggerOverridePath": "electrical.switches.bank.16.16.state",
          "positionUpdateIntervals": [2,1],
          "staticUpdateIntervals": [3,3]
        },
        "otherVessels": {
          "positionUpdateIntervals": [4,0],
          "staticUpdateIntervals": [5,0]
        }
      }
    ]
  },
  "enabled": true
}
```



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
