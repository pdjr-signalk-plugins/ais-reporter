# ais-log-uploader

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

Create a system user for the new service.

```bash
sudo useradd -r -s /usr/sbin/nologin ais-log-uploader
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

Finally, set the service to run automatically on system reboot and
start the service.

```bash
sudo systemctl enable ais-log-uploader
sudo systemctl start ais-log-uploader
```

`ais-log-uploader` has a number of features which support
reconfiguration and monitoring of the server performance.
You can get documentation of these using the command:

```bash
ais-log-uploader -h
```
