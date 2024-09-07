# pdjr-ais-reporter

**pdjr-ais-reporter** is a
[Signal K](https://www.signalk.org/)
plugin which reports position and static data for the host ship and for
vessels detected over AIS to one or more UDP endpoints.
The plugin can be used to send vessel updates to online AIS consolidation
services like
[MarineTraffic](https://www.marinetraffic.com).

On a vessel with no AIS transceiver (but a working GPS) the plugin will
publish position and static data for the 'self' vessel.
On a vessel with an AIS receiver data on all vessels known to Signal K
will be uploaded to the specified endpoints.

Reports are issued at a user configured rate giving some control over
Ethernet data and bandwidth use.

## Configuration

### UDP endpoints to report to
A list of service endpoints to which the plugin should send AIS reports.

Each service endpoint is specified by its IP address and the number of its
listening port.

### Position update interval (s)
The frequency at which position updates for active vessels should
be sent to endpoints, expressed as an interval in seconds.
A value of 0 disbles all position and static reporting.

At the end of an update interval the most recent position report
received from each active vessel is transmitted to every endpoint.

Increasing this value will reduce the amount of data transmitted
over the host Internet connection at the cost of temporal accuracy
in position reporting.

### Static update interval (s)
The frequency at which static data updates for active vessels should
be sent to endpoints, expressed as an interval in seconds.
A value of 0 disbles static data reporting.

### Ignore data older than (s)
The interval after which a vessel's data reports cease to be transmitted
after SignalK stops receiving AIS updates for the vessel.
This value determines what constitutes an 'active' vs. 'inactive'
vessels.

### My AIS transceiver class
The class of transceiver used on the host vessel (if any).

A value of 'none' will fake a Class B position and status report
for the host vessel even if it does not have AIS equipment.

If you have an AIS transceiver then specify its type here.

## Author
Paul Reeve <preeve@pdjr.eu>

