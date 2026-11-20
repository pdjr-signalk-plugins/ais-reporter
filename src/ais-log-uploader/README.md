# ais-log-uploader

`ais-log-uploader` is a stand-alone server which listens on a UDP port
for incoming AIS !AIVDM position reports, collating received reports
into a log which is eventually transmitted to a specified email address.



specified over a UDP
## Installation

Grab the git repository and install `ais-log-uploader` and its
associated service file.

```bash
cd ~

git pull https://github.com/pdjr-signalk/ais-reporter.git

sudo cp ais-reporter/ais-log-uploader/ais-log-uploader /usr/local/bin/
sudo cp ais-reporter/ais-log-uploader/ais-log-uploader.service /etc/systemd/system/
sudo chmod 755 /usr/local/bin/ais-log-uploader
sudo chmod 644 /etc/systemd/system/ais-log-uploader.service
rm -rf ais-reporter
```

Create a system user for the new service and restart `systemd`.

```bash
sudo useradd -r -s /usr/sbin/nologin ais-log-uploader
sudo systemctl daemon-reload
```

Run `ais-log-uploader` from the command line using the `-c` (configure)
option to set the UDP port on which the server will listen for incoming
AIS messages and the email recipient to whom consolidated daily logs
will be posted.
Do not simply copy the following example - set values appropriate for
your use case making sure that the supplied port number matches the
port number you specified in the configuration of the `ais-reporter`
plugin that feeds this service.

```bash
$> sudo ais-log-uploader -c -p 12345 -r wordpress9534@gmail.com
ACCURACY = 4, PORT = 12345, RECIPIENT = wordpress9534@gmail.com
```

If you want the service to run automatically on system reboot then
enable the service.

```bash
sudo systemctl enable ais-log-uploader
```

## Running the service

`ais-log-uploader` can be run from a terminal prompt with

```bash
ais-log-uploader
```

But since the server immediately enters a listening loop this is not
very useful except when used with options for configuration, testing
and displaying program documentation (use `ais-log-uploader -h`).

Typically, `ais-log-uploader` will be started under systemd control.
Immediately after installation you can start the server for the first
time.

```bash
sudo systemctl start ais-log-uploader
```
