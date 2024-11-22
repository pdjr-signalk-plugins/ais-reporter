# pdjr-ais-reporter

**pdjr-ais-reporter** is a
[Signal K](https://www.signalk.org/)
plugin which reports position and static data for the host ship and for
vessels detected over AIS to one or more UDP endpoints.
The plugin can be used to send vessel data to online AIS consolidation
services like
[MarineTraffic](https://www.marinetraffic.com).

The plugin can report position and static data for the 'self' vessel,
requiring only that the current vessel position is available on a
Signal K path.

On a vessel with an AIS receiver data on all nearby vessels known to
Signal K may be uploaded to the specified endpoints.

Reports are issued at a user configured rate giving some control over
Ethernet data and bandwidth use.

## Configuration

### UDP endpoints to report to
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

If you do have an AIS transceiver then specify its type here.

## Author
Paul Reeve <preeve_at_pdjr_dot_eu>
