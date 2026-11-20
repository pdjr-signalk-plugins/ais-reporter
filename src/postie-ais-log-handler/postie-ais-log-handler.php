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
      $retval += haversineGreatCircleDistance($log[$i]['ais']['lat']['value'], $log[$i]['ais']['lon']['value'], $log[$i + 1]['ais']['lat']['value'], $log[$i + 1]['ais']['lon']['value']);
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
  global $nominatum_url, $nominatum_address_properties;
  $retval = null;
  $url = "{$nominatum_url}format=json&lat={$lat}&lon={$lon}";
  $context = stream_context_create([ 'http' => [ 'user_agent' => 'Simon Ferndriger', ], ]);
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

/**********************************************************************
 * Render a JSON text representation of the Signal K static data model
 * into an HTML table summarising the current state of the vessel's
 * tanks and batteries
 * 
 * @param $url - the url of the JSON file to be parsed.
 * @return - string containing the parse result.
 */
function render_json_attachment($url) {
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
    if (array_key_exists('solar', $json['electrical'])) {
      $solarYield = 0;
      foreach ($json['electrical']['solar'] as $solarid => $solar) {
        if (array_key_exists('yieldToday', $solar) && array_key_exists('value', $solar['yieldToday'])) {
          $solarYield += $solar['yieldToday']['value'];
        }
      }
      $retval .= "<div style='display: flex; flex-direction: row; width: 100%;'>";
      $retval .= "<div style='flex: 0.5;'>Solar yield today</div>";
      $retval .= "<div style='flex: 0.5;'>" . sprintf("%.2f", $solarYield / 3600000) . "kWh</div>\n";
      $retval .= "</div>";
    }

    $retval .= "</div>";
  }
  $retval .= "</div>\n";
  return($retval);
}

function render_log_item_popup($log_item) {
  $retval = "<div style='display: flex; flex-direction: column; width: 200px; background: #e0e0e0; margin: -7px 0;'>";
  foreach ($log_item['ais'] as $key => $value) {
    $retval .= "<div style='display: flex; flex-direction: row; width: 100%; margin: -7px 0;'>";
    $retval .= "<div style='flex: 0.5;'>{$key}</div>";
    $retval .= "<div style='flex: 0.5;'>{$value['value']}&nbsp;{$value['units']}</div>";
    $retval .= "</div>"; 
  }
  $retval .= "</div>";
  return($retval);
}

function render_log_abstract($log) {
  $retval = "<div style='display: flex; flex-direction: column; width: 100%; background: #e0e0e0; margin-top: 20px;'>\n";
  $retval .= "  <div style='display: flex; flex-direction: row; width: 100%;'>\n";
  $retval .= "    <div style='flex: 0.5;'>Distance travelled</div>\n";
  $retval .= "    <div style='flex: 0.5;'>" . distanceTravelled($log) . "km</div>\n";
  $retval .= "  </div>\n";
  $retval .= "  <div style='display: flex; flex-direction: row; width: 100%;'>\n";
  $retval .= "    <div style='flex: 0.5;'>Engine run-time</div>\n";
  $retval .= "    <div style='flex: 0.5;'>" . engineRuntime($log) . " (hh:mm)</div>\n";
  $retval .= "  </div>\n";
  $retval .= "</div>\n";
  return($retval);
}

function render_ais_attachment($url) {
  global $ais_decoder_overrides;
  $retval = "";
  $log = SimpleAisDecoder::decode_file($url, $ais_decoder_overrides);
  if (count($log) > 0) {
    if (count($log) == 1) { // One log entry means moored
      $retval = "[leaflet-map lat={$log[0]['ais']['lat']['value']} lng={$log[0]['ais']['lon']['value']} zoom=13]\n";
    } else { // Otherwise must be cruising
      $retval = "[leaflet-map fitbounds]\n";
      $retval .= "[leaflet-line latlngs='" . join(";", array_map(fn($value): string => $value['ais']['lat']['value'] . "," . $value['ais']['lon']['value'], $log)) . "']\n";
    }

    // Add a marker for every moored position.
    $moored_log = array_filter($log, function($log_item) { return($log_item['ais']['status']['value'] == 5); });
    if (count($moored_log) > 0) {
      foreach ($moored_log as $log_item) {
        $marker_props = "svg iconsize='18,12' background='" . array('#7f7f7f','#007f00','#00007f')[$log_item['ais']['smi']['value']] . "'";
        $popup = "<b>" . (new DateTimeImmutable($log_item['timestamp']))->format('H:i:s') . "</b>" . render_log_item_popup($log_item);
        $retval .= "[leaflet-marker {$marker_props} lat={$log[0]['ais']['lat']['value']} lng={$log[0]['ais']['lon']['value']}]{$popup}[/leaflet-marker]\n";
      }

      // Reverse geo-lookup to get start and stop place names
      $start = null; $end = null; $subhead = null; $tags = array();
      $start = nominatum_query($moored_log[0]['ais']['lat']['value'], $moored_log[0]['ais']['lon']['value']);
      if ($start != null) $tags[] = $start;
      $subhead = ($start != null)?$start:"{$moored_log[0]['ais']['lat']['value']},{$moored_log[0]['ais']['lon']['value']}";
      if (count($moored_log) > 1) {
        $end = nominatum_query($moored_log[count($moored_log)-1]['ais']['lat']['value'], $moored_log[count($moored_log)-1]['ais']['lon']['value']);
        if ($end != null) $tags[] = $end;
        $subhead .= " to " . ($end != null)?$end:"{$moored_log[count($moored_log)-1]['ais']['lat']['value']},{$moored_log[count($moored_log)-1]['ais']['lon']['value']}";
      }
      $retval = "<h2>{$subhead}</h2><p>" . $retval;
      wp_set_post_tags($post['ID'], $tags, true);
    }
    $retval .= render_log_abstract($moored_log);
  }
  return($retval);
}

/**********************************************************************
 * The post's AIS and JSON attachments are rendered here.
 */
function postie_log_attachment_processor_postie_post_before($post) {
  $ais_regex = "/<a href=\"(.*\.ais)\">.*<\/a>/";
  $json_regex = "/<a href=\"(.*\.json)\">.*<\/a>/";
  $matches = array();
  $change_attachment_storage_location = false;

  // Replace AIS attachment URL with derived content
  if (preg_match($ais_regex, $post['post_content'], $matches)) {    
    $post['post_content'] = str_replace(
      $matches[0],
      render_ais_attachment($_SERVER['DOCUMENT_ROOT'] . parse_url($matches[1])['path']),
      $post['post_content']
    );
  }

  // Replace JSON attachment URL with derived content
  if (preg_match($json_regex, $post['post_content'], $matches)) {
    $post['post_content'] = str_replace(
      $matches[0],
      render_json_attachment($_SERVER['DOCUMENT_ROOT'] . parse_url($matches[1])['path']),
      $post['post_content']
    );
  }

  $change_attachment_storage_location = true;

  if ($change_attachment_storage_location) { add_filter('upload_dir', 'log_upload_dir'); }

  return($post);
}

/**********************************************************************
 * The post's JSON attachment is not required after rendering by the
 * the postie_post_before fiter, so we delete it here.
 */
function postie_log_attachment_processor_postie_post_after($post) {
  global $post_discard_attachments;
  remove_filter('upload_dir', 'log_upload_dir');

  $attachments = get_attached_media('', $post['ID'] );
  if (!empty($attachments)) {
    foreach ( $attachments as $attachment ) {
      if (in_array($attachment->post_mime_type, $post_discard_attachments, true)) {
        wp_delete_attachment($attachment->ID, true);
      }
    }
  }
}

add_filter('postie_post_before', 'postie_log_attachment_processor_postie_post_before', 10, 2);
add_filter('postie_post_after', 'postie_log_attachment_processor_postie_post_after');

?>
