<?php

namespace PDJR\AisLogAisShortcode;

/**********************************************************************
 * Add support for [ais url='...'] shortcode.
 */


$post_discard_attachments = array('application/json');
$nominatum_url = 'https://nominatim.openstreetmap.org/reverse?';
$nominatum_address_properties = array('hamlet', 'village', 'suburb', 'city_district', 'town', 'municipality', 'city');
$ais_decoder_overrides = array('timestamp' => null,'type' => null, 'repeat' => null, 'mmsi' => null, 'accuracy' => null);

class SimpleAisDecoder {

  /********************************************************************
   * Decodes the specified AIS log $file containing lines of the form
   *
   *   "timestamp !AIVDM-message"
   *
   * into an array of the form:
   *
   *   [
   *     'timestamp' => timestamp,
   *     'ais' => [
   *       string => [
   *         'value' => number,
   *         'units' => string
   *       ]
   *     ]
   *   ]
   *
   * where array is an associative array containing the fields of the
   * !AIVDM-message filtered by values passed in $overides.
   *
   * $overrides is an associative array.
   *
   * @param file - name of the AIS log file to be decoded.
   * @param overrides - an array of the form [ 'key' => 'value', ... ].
   * @return - [ 'timestamp' => timestamp, 'ais' => array, ... ]
    */
  public static function decode_file(string $file, $overrides = []) {
    $retval = array();
    if (($fn = fopen($file, "r")) !== false) {
      while (($line = fgets($fn)) !== false) {
        $timestamp = trim(strstr($line, ' ', true));
        $msg = trim(strstr($line, ' '));
        if (str_starts_with($msg, '!AIVDM,')) {
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
      $retval['accuracy'] = array('value' => bindec(substr($bitString, 60, 1)), 'units' => '');
      $retval['cog'] = array('value' => bindec(substr($bitString, 116, 12)) / 10.0, 'units' => 'deg'); // Degrees
      $retval['heading'] = array('value' => bindec(substr($bitString, 128, 9)), 'units' => 'deg');
      $retval['lat'] = array('value' => round(self::signedInt(substr($bitString, 89, 27)) / 600000.0, 4), 'units' => 'deg');
      $retval['lon'] = array('value' => round(self::signedInt(substr($bitString, 61, 28)) / 600000.0, 4), 'units' => 'deg');
      $retval['mmsi'] = array('value' => bindec(substr($bitString, 8, 30)), 'units' => '');
      $retval['repeat'] = array('value' => bindec(substr($bitString, 6, 2)), 'units' => '');
      $retval['rot'] = array('value' => round(pow((self::signedInt(substr($bitString, 42, 8)) / 4.733), 2) * ((self::signedInt(substr($bitString,42,8)) < 0)?-1:1), 2), 'units' => 'deg/min');
      $retval['smi'] = array('value' => bindec(substr($bitString, 143, 2)), 'units' => '');
      $retval['sog'] = array('value' => (bindec(substr($bitString, 50, 10)) / 10.0) * 1.852, 'units' => 'kph'); // KPH
      $retval['status'] = array('value' => bindec(substr($bitString, 38, 4)), 'units' => '');
      $retval['timestamp'] = array('value' => bindec(substr($bitString, 137, 6)), 'units' => '');
      $retval['type'] = array('value' => $messageType, 'units' => '');

      foreach ($overrides as $key => $value) {
        if ($value == null) {
          unset($retval[$key]);
        } else {
          $retval[$key] = array('value' => $value, 'units' => '');
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
 * Perform a reverse location search using the OpenStreetMap Nominatum
 * service.
 * 
 * @param location - as [lat, lon] array
 * @param return - recovered location name or "lat, lon" if mot found.
 */
function nominatum_query($lat, $lon) {
  global $nominatum_url, $nominatum_address_properties;
  $retval = null;
  $url = "{$nominatum_url}format=json&lat={$lat}&lon={$lon}";
  $context = stream_context_create([ 'http' => [ 'user_agent' => basename(__FILE__, '.php') ] ]);

  $json_text = file_get_contents($url, false, $context);
  if ($json_text != null) {
    $json = json_decode($json_text);
    if ($json != null) {
      $address = $json->{'address'};
      if ($address != null) {
        foreach($nominatum_address_properties as $selector) {
	        if (property_exists($address, $selector)) {
	          $retval = $address->{$selector};
            if ($retval != null) break;
          }
        }
      }
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

function distanceTravelled($log) {
  $retval = 0;
  if (count($log) > 1) {
    for ($i = 0; $i < ($count($log) - 1); $i++) {
      $retval += haversineGreatCircleDistance($log[$i]['ais']['lat']['value'], $log[$i]['ais']['lon']['value'], $log[$i + 1]['ais']['lat']['value'], $log[$i + 1]['ais']['lon']['value']);
    }
  }
  return($retval);
}

function render_log_abstract($log) {
  $retval = "<div style='display: flex; flex-direction: column; width: 100%; background: #e0e0e0; margin-top: 20px;'>\n";
  $retval .= "  <div style='display: flex; flex-direction: row; width: 100%;'>\n";
  $retval .= "    <div style='flex: 0.5;'>Distance travelled</div>\n";
  $retval .= "    <div style='flex: 0.5;'>" . distanceTravelled($log) . " km</div>\n";
  $retval .= "  </div>\n";
  $retval .= "  <div style='display: flex; flex-direction: row; width: 100%;'>\n";
  $retval .= "    <div style='flex: 0.5;'>Engine run-time</div>\n";
  $retval .= "    <div style='flex: 0.5;'>" . engineRuntime($log) . " (hh:mm)</div>\n";
  $retval .= "  </div>\n";
  $retval .= "</div>\n";
  return($retval);
}

function render_log_item_popup($log_item) {
  $retval = "<div style='display: flex; flex-direction: column; width: 200px; background: #e0e0e0;'>";
  foreach ($log_item['ais'] as $key => $value) {
    $retval .= "<div style='display: flex; flex-direction: row; width: 100%;'>";
    $retval .= "<div style='flex: 0.5;'>{$key}</div>";
    $retval .= "<div style='flex: 0.5;'>{$value['value']}&nbsp;{$value['units']}</div>";
    $retval .= "</div>"; 
  }
  $retval .= "</div>";
  return($retval);
}

function render_ais_attachment($url) {
  global $ais_decoder_overrides;
  $retval = ["", []];
  $log = SimpleAisDecoder::decode_file($url, $ais_decoder_overrides);
  if (count($log) > 0) {
    if (count($log) == 1) { // One log entry means moored
      $retval[0] = "[leaflet-map lat={$log[0]['ais']['lat']['value']} lng={$log[0]['ais']['lon']['value']} zoom=13]\n";
    } else { // Otherwise must be cruising
      $retval[0] = "[leaflet-map fitbounds]\n";
      $retval[0] .= "[leaflet-line latlngs='" . join(";", array_map(fn($value): string => $value['ais']['lat']['value'] . "," . $value['ais']['lon']['value'], $log)) . "']\n";
    }

    // Add a marker for every moored position.
    $moored_log = array_filter($log, function($log_item) { return($log_item['ais']['status']['value'] == 5); });
    if (count($moored_log) > 0) {
      foreach ($moored_log as $log_item) {
        $marker_props = "svg iconsize='18,12' background='" . array('#7f7f7f','#007f00','#00007f')[$log_item['ais']['smi']['value']] . "'";
        $popup = "<b>" . (new \DateTimeImmutable($log_item['timestamp']))->format('H:i:s') . "</b>" . render_log_item_popup($log_item);
        $retval[0] .= "[leaflet-marker {$marker_props} lat={$log[0]['ais']['lat']['value']} lng={$log[0]['ais']['lon']['value']}]{$popup}[/leaflet-marker]\n";
      }

      // Reverse geo-lookup to get start and stop place names
      $start = null; $end = null; $subhead = null; $tags = array();
      $start = nominatum_query($moored_log[0]['ais']['lat']['value'], $moored_log[0]['ais']['lon']['value']);
      if ($start != null) $retval[1][] = $start;
      $subhead = ($start != null)?$start:"{$moored_log[0]['ais']['lat']['value']},{$moored_log[0]['ais']['lon']['value']}";
      if (count($moored_log) > 1) {
        $end = nominatum_query($moored_log[count($moored_log)-1]['ais']['lat']['value'], $moored_log[count($moored_log)-1]['ais']['lon']['value']);
        if ($end != null) $retval[1][] = $end;
        $subhead .= " to " . ($end != null)?$end:"{$moored_log[count($moored_log)-1]['ais']['lat']['value']},{$moored_log[count($moored_log)-1]['ais']['lon']['value']}";
      }
      $retval[0] = "<h2>{$subhead}</h2><p>" . $retval[0];
    }
    $retval[0] .= render_log_abstract($moored_log);
  }
  return($retval);

}

function shortcode($atts, $content = null) {
  $retval = "";
  if ($atts['url']) {
    $retval = do_shortcode(render_ais_attachment($atts['url'])[0]);
  }
  return($retval);
}

add_shortcode('ais', 'PDJR\AisLogAisShortcode\shortcode');

?>
