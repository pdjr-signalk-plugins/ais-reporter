# postie-ais-log-handler.php

`postie-ais-log-handler.php` is a WordPress plugin which creates blog
posts from email messages retrieved by the WordPress Postie plugin
from a user email account.

Typically the consumed email messages will originate from an
`ais-log-uploader` server instance running elsewhere on the Internet.

## System requirements

1. Identify/create an email account dedicated to log system reporting.

2. Install and configure `ais-log-uploader` on a suitable host system,
   and ensure that it sends daily reports to the nominated email
   account.

## Installation

Install and configure the WordPress Postie plugin so that it
automatically retrieves emails from the nominated email account.

Login to your WordPress site host, download the git repository and copy
`postie-ais-log-handler.php` to your WordPress site's must-use plugin
directory.

```bash
git clone https://github.com/pdjr-signalk-plugins/ais-reporter.git
cp ais-reporter/src/postie-ais-log-handler/postie-ais-log-handler.php <wordpress>/wp-content/mu-plugins/

