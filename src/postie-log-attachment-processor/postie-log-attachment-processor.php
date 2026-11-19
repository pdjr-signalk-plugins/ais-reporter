<?php 
/**
 * Implements postie_post_before and postie_post_after filters.
 * 
 * postie_post_before receives an email and its attachment. If
 * the attachment has a name of the form '*.ais' then the post is
 * assumed to be an AIS log upload sent by ais-log-uploader and
 * the post and attachment are processed into a replacement page.
 * 
 * The AIS log attachment is processed into a set of Leaflet
 * shortcodes that describe a map representing the AIS log. Some log
 * data is processed to add descriptive text to the nascent post.
 */

class SimpleAisDecoder {
  public static function decode_file(string $file, $overrides = []) {
    $retval = array();
    if (($fn = fopen($file, "r")) !== false) {
      while (($line = fgets($fn)) !== false) {
        $timestamp = trim(strstr($line, ' ', true));
        $msg = trim(strstr($line, ' '));
        if (str_starts_with($msg, '!AIVDM,')) {
          $overrides['timestamp'] = $timestamp;
          if ($decoded_msg = SimpleAisDecoder::decode($msg, $overrides)) {
            $retval[] = array('timestamp' => $timestamp, 'ais' => $decoded_msg);
          } else {
            DebugEcho(">>> error decoding {$msg}");
          }
        } else {
          DebugEcho(">>> ignoring non AIS log message ({$line})");
        }
      }
      fclose($fn);
    } else {
      DebugEcho(">>> error opening {$file}");
    }
    return($retval);
  }

  public static function decode(string $nmea, $overrides = []): ?array {
    $retval = false;
    // Strip checksum and split fields
    $clean = explode('*', trim($nmea))[0];
    $parts = explode(',', $clean);

    if (count($parts) < 7 || !in_array($parts[0], ['!AIVDM', '!AIVDO'], true)) {
      return null;
    }

    // Multi-part messages (e.g., Type 5) require buffering payloads before decoding
    if ((int)$parts[1] > 1) {
      return ['error' => 'Multi-part message requires payload concatenation'];
    }

    $payload = $parts[5];
    $fillBits = (int)$parts[6];
    $bitString = self::payloadToBits($payload, $fillBits);

    $messageType = bindec(substr($bitString, 0, 6));

    // Decode Class A Position Reports (Types 1, 2, 3)
    if (in_array($messageType, [1, 2, 3], true)) {
      $retval = array();
      $retval['type'] = $messageType;
      $retval['repeat'] = bindec(substr($bitString, 6, 2));
      $retval['mmsi'] = bindec(substr($bitString, 8, 30));
      $retval['status'] = bindec(substr($bitString, 38, 4));
      $retval['rot'] = pow((self::signedInt(substr($bitString, 42, 8)) / 4.733), 2) * ((self::signedInt(substr($bitString,42,8)) < 0)?-1:1);
      $retval['sog'] = (bindec(substr($bitString, 50, 10)) / 10.0) * 1.852; // KPH
      $retval['accuracy'] = bindec(substr($bitString, 60, 1));
      $retval['lon'] = round(self::signedInt(substr($bitString, 61, 28)) / 600000.0, 4);
      $retval['lat'] = round(self::signedInt(substr($bitString, 89, 27)) / 600000.0, 4);
      $retval['cog'] = bindec(substr($bitString, 116, 12)) / 10.0; // Degrees
      $retval['heading'] = bindec(substr($bitString, 128, 9));
      $retval['timestamp'] = bindec(substr($bitString, 137, 6));
      $retval['smi'] = bindec(substr($bitString, 143, 2));

      foreach ($overrides as $key => $value) {
        if ($value == null) {
          unset($retval[$key]);
        } else {
          $retval[$key] = $value;
        }
      }
    }
    return($retval);
  }

  private static function payloadToBits(string $payload, int $fillBits): string {
    $bits = '';
    $len = strlen($payload);

    for ($i = 0; $i < $len; $i++) {
      $val = ord($payload[$i]) - 48;
      if ($val > 40) {
        $val -= 8;
      }
      $bits .= str_pad(decbin($val), 6, '0', STR_PAD_LEFT);
    }

    return $fillBits > 0 ? substr($bits, 0, -$fillBits) : $bits;
  }

  private static function signedInt(string $bits): int {
    $len = strlen($bits);
    $val = bindec($bits);
    if ($bits[0] === '1') {
      $val -= (1 << $len);
    }
    return $val;
  }
}

/**********************************************************************
 * Get the Great Circle distance between two points on the surface of
 * a sphere (defaults to an approximated Earth).
 * 
 * @param latitudeFrom - latitude of first point.
 * @param longitudeFrom - longitude of first point.
 * @param latitudeTo - latitude of second point.
 * @param longitudeTo - longitude of second point.
 * @param sphereRadius - radius of the sphere in fundamental units.
 * @return - distance in kilometres.
 */
function haversineGreatCircleDistance($latitudeFrom, $longitudeFrom, $latitudeTo, $longitudeTo, $sphereRadius = 6371000) {
  $latFrom = deg2rad($latitudeFrom); $lonFrom = deg2rad($longitudeFrom);
  $latTo = deg2rad($latitudeTo); $lonTo = deg2rad($longitudeTo);
  $latDelta = $latTo - $latFrom; $lonDelta = $lonTo - $lonFrom;
  $angle = 2 * asin(sqrt(pow(sin($latDelta / 2), 2) + cos($latFrom) * cos($latTo) * pow(sin($lonDelta / 2), 2)));
  return($angle * $sphereRadius);
}

/**********************************************************************
 * 
 */
function distanceTravelled($log) {
  $retval = 0;
  if (count($log) > 1) {
    for ($i = 0; $i < ($count($log) - 1); $i++) {
      $retval += haversineGreatCircleDistance($log[$i]['ais']['lat'], $log[$i]['ais']['lon'], $log[$i + 1]['ais']['lat'], $log[$i + 1]['ais']['lon']);
    }
  }
  return($retval);
}

function engineRuntime($log) {
  $retval = "00:00";
  if (count($log) > 1) {
    $start_timestamp = strtotime($log[0]['timestamp']);
    $end_timestamp = strtotime($log[count($log)-1]['timestamp']);
    $retval = $end_timestamp - $start_timestamp;
    $retval = sprintf("%02d:%02d", intdiv($retval, 3600), intdiv(($retval % 3600), 60));
  }
  return($retval);
}

/**********************************************************************
 * Perform a reverse location search using the OpenStreetMap Nominatum
 * service.
 * 
 * @param location - as [lat, lon] array
 * @param return - recovered location name or "lat, lon" if mot found.
 */
function nominatum_query($lat, $lon) {
  $retval = null;
  $url = "https://nominatim.openstreetmap.org/reverse?format=json&lat={$lat}&lon={$lon}";
  $context = stream_context_create([ 'http' => [ 'user_agent' => 'Simon Ferndriger', ], ]);
  $json_text = file_get_contents($url, false, $context);
  if ($json_text != null) {
    $json = json_decode($json_text);
    if ($json != null) {
      $address = $json->{'address'};
      if ($address != null) {
        foreach(array('hamlet', 'village', 'suburb', 'city_district', 'town', 'municipality', 'city') as $selector) {
	        if (property_exists($address, $selector)) {
	          $retval = $address->{$selector};
            if ($retval != null) break;
          }
        }
      }
    }
  }
  return(($retval)?$retval:"{$location[0]}, {$location[1]}");
}

/**********************************************************************
 * Parse a JSON text representation of the Signal K static data model
 * into an HTML table summarising the current state of the vessel's
 * tanks and batteries
 * 
 * @param $url - the url of the JSON file to be parsed.
 * @return - string containing the parse result.
 */
function parse_json_attachment($url) {
  $retval = "<div class='end-of-day'>\n";
  $json = json_decode(file_get_contents($url), true);
  if ($json) {
    $retval .= "<div style='display: flex; flex-direction: column; width: 100%; background: #e0e0e0; margin-top: 20px;'>\n";
    foreach ($json['tanks'] as $tanktype => $tankids) {
      foreach ($tankids as $tankid => $tank) {
        if (array_key_exists('currentLevel', $tank)) {
          $retval .= "<div style='display: flex; flex-direction: row; width: 100%;'>";
          $retval .= "<div style='flex: 0.5;'>Tank {$tankid} ({$tanktype})</div>";
          $retval .= "<div style='flex: 0.5;'>" . round($tank['currentLevel']['value'] * 100) . "%</div>\n";
          $retval .= "</div>";
	      }
      }
    }
    $retval .= "</div>";
    $retval .= "<div style='display: flex; flex-direction: column; width: 100%; background: #e0e0e0; margin-top: 20px;'>\n";
    foreach ($json['electrical']['batteries'] as $batteryid => $battery) {
      if (array_key_exists('capacity', $battery) && array_key_exists('stateOfCharge', $battery['capacity'])) {
          $retval .= "<div style='display: flex; flex-direction: row; width: 100%;'>";
          $retval .= "<div style='flex: 0.5;'>Battery {$batteryid}</div>";
          $retval .= "<div style='flex: 0.5;'>" . round($battery['capacity']['stateOfCharge']['value'] * 100) . "%</div>\n";
          $retval .= "</div>";
      }
    }
    $retval .= "</div>";
  }
  $retval .= "</div>\n";
  return($retval);
}


function postie_log_attachment_processor_function($post) {
  $ais_regex = "/<a href=\"(.*\.ais)\">.*<\/a>/";
  $json_regex = "/<a href=\"(.*\.json)\">.*<\/a>/";

  $matches = array();
  $change_attachment_storage_location = false;

  if (preg_match($ais_regex, $post['post_content'], $matches)) {
    $attachment_filename = $_SERVER['DOCUMENT_ROOT'] . parse_url($matches[1])['path'];
    $log = SimpleAisDecoder::decode_file($attachment_filename, array('type' => null, 'repeat' => null, 'mmsi' => null, 'accuracy' => null));
    if (count($log) > 0) {
      if (count($log) == 1) { // One log entry means moored
        $retval = "[leaflet-map lat={$log[0]['ais']['lat']} lng={$log[0]['ais']['lon']} zoom=13]\n";
      } else { // Otherwise must be cruising
        $retval = "[leaflet-map fitbounds]\n";
        $retval .= "[leaflet-line latlngs='" . join(";", array_map(fn($value): string => $value['ais']['lat'] . "," . $value['ais']['lon'], $log)) . "']\n";
      }
      // Add a marker for every moored position.
      $moored_log = array_filter($log, function($log_item) { return($log_item['ais']['status'] == 5); });
      if (count($moored_log) > 0) {
      	foreach ($moored_log as $log_item) {
        	$marker_props = "svg iconsize='18,12' color='" . array('#7f7f7f','#007f00','#00007f')[$log_item['ais']['smi']] . "'";
		      $popup = "";
        	foreach ($log_item['ais'] as $key => $value) $popup .= ($key . " -> " . $value . "<br>");
        	$retval .= "[leaflet-marker {$marker_props} lat={$log[0]['ais']['lat']} lng={$log[0]['ais']['lon']}]{$popup}[/leaflet-marker]\n";
      	}
        // Reverse geo-lookup to get start and stop place names
        $start = nominatum_query($moored_positions[0]['ais']['lat'], $moored_positions[0]['ais']['lon']);
        $end = "";
        if (count($moored_positions) > 1) {
          $end = " to " . nominatum_query($moored_positions[count($moored_positions)-1]['ais']['lat'], $moored_positions[count($moored_positions)-1]['ais']['lon']);
        }
        $retval = "<h2>{$start}{$end}</h2><p>" . $retval;
      }

      $moving_log = array_filter($log, function($log_item) { return($log_item['ais']['status'] != 5); });
      $retval .= "<div style='display: flex; flex-direction: column; width: 100%; background: #e0e0e0; margin-top: 20px;'>\n";
      $retval .= "  <div style='display: flex; flex-direction: row; width: 100%;'>\n";
      $retval .= "    <div style='flex: 0.5;'>Distance travelled</div>\n";
      $retval .= "    <div style='flex: 0.5;'>" . distanceTravelled($moving_log) . "km</div>\n";
      $retval .= "  </div>\n";
      $retval .= "  <div style='display: flex; flex-direction: row; width: 100%;'>\n";
      $retval .= "    <div style='flex: 0.5;'>Engine run-time</div>\n";
      $retval .= "    <div style='flex: 0.5;'>" . engineRuntime($moving_log) . " (hh:mm)</div>\n";
      $retval .= "  </div>\n";
      $retval .= "</div>\n";

      $post['post_content'] = str_replace($matches[0], $retval, $post['post_content']);
    }
  }

  if (preg_match($json_regex, $post['post_content'], $matches)) {
    $content = parse_json_attachment($_SERVER['DOCUMENT_ROOT'] . parse_url($matches[1])['path']);
    $post['post_content'] = str_replace($matches[0], $content, $post['post_content']);
  }

  $change_attachment_storage_location = true;

  if ($change_attachment_storage_location) { add_filter('upload_dir', 'log_upload_dir'); }

  return($post);
}

function postie_log_attachment_processor_reset() {
  remove_filter('upload_dir', 'log_upload_dir');
}

add_filter('postie_post_before', 'postie_log_attachment_processor_function', 10, 2);
add_filter('postie_post_after', 'postie_log_attachment_processor_reset');

?>
