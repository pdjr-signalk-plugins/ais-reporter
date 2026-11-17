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
    $retval = [];
    if (($fn = fopen($file, "r")) !== false) {
      while (($line = fgets($fn)) !== false) {
        $timestamp = trim(strstr($line, ' ', true));
        $msg = trim(strstr($line, ' '));
        if (str_starts_with($msg, '!AIVDM,')) {
          $overrides['timestamp'] = $timestamp;
          if ($decoded_msg = SimpleAisDecoder::decode($msg, $overrides)) {
            $retval[] = $decoded_msg;
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
 * Perform a reverse location search using the OpenStreetMap Nominatum
 * service.
 * 
 * @param location - as [lat, lon] array
 * @param return - recovered location name or "lat, lon" if mot found.
 */
function nominatum_query($location) {
  $retval = null;
  $url = "https://nominatim.openstreetmap.org/reverse?format=json&lat={$location[0]}&lon={$location[1]}";
  $context = stream_context_create([ 'http' => [ 'user_agent' => 'Simon Ferndriger', ], ]);
  $json_text = file_get_contents($url, false, $context);
  if ($json_text != null) {
    $json = json_decode($json_text);
    if ($json != null) {
      $address = $json->{'address'};
      if ($address != null) {
        foreach(array('hamlet', 'village', 'suburb', 'city_district', 'town', 'municipality', 'city') as $selector) {
          $retval = $address->{$selector};
          if ($retval != null) break;
        }
      }
    }
  }
  return(($retval)?$retval:"{$location[0]}, {$location[1]}");
}

/**********************************************************************
 * Called by postie to process a received email and its attachment. If
 * the attachment has a name of the form '*.ais' then the post is
 * assumed to be an AIS log upload sent by ais-log-uploader.
 * The AIS log attachment is processed into a set of Leaflet shortcodes
 * that describe a map representing the AIS log.
 * Some log data is processed to add descriptive text to the nascent
 * post.
 * 
 * @param post - the candidate post prepared by postie.
 * @return - the transformed post ready for insertion into WordPress.
 */
function postie_log_attachment_processor_function($post) {
  $ais_regex = "/<a href=\"(.*\.ais)\">.*<\/a>/";
  $matches = array();
  $change_attachment_storage_location = false;
  $post_id = isset($post['ID']) ? $post['ID'] : 0;

  if (preg_match($ais_regex, $post['post_content'], $matches)) {
    $url_path = parse_url($matches[1])['path'];
    $ais_log = SimpleAisDecoder::decode_file(
      $_SERVER['DOCUMENT_ROOT'] . $url_path,
      array('type' => null, 'repeat' => null, 'mmsi' => null, 'accuracy' => null)
    );
    if (count($ais_log) > 0) {
      if (count($ais_log) == 1) { // One log entry means moored
        $replacement = "[leaflet-map lat={$ais_log[0]['lat']} lng={$ais_log[0]['lon']} zoom=13]\n";
      } else { // Otherwise must be cruising
        $replacement = "[leaflet-map fitbounds]\n";
        $replacement .= "[leaflet-line latlngs='" . join(";", array_map(fn($value): string => $value['lat'] . "," . $value['lon'], $ais_log)) . "']\n";
      }
      // Add a marker for every moored position.
      $stops = array_filter($ais_log, function($ais) { return($ais['status'] == 5); });
      foreach ($stops as $stop) {
        $marker_props = "svg iconsize='18,12' color='" . array('#7f7f7f','#007f00','#00007f')[$stop['smi']] . "'";
        foreach ($stop as $key => $value) $popup .= ($key . " -> " . $value . "<br>");
        $replacement .= "[leaflet-marker {$marker_props} lat={$ais_log[0]['lat']} lng={$ais_log[0]['lon']}]{$popup}[/leaflet-marker]\n";
      }
      $start = nominatum_query($stops[0]['lat'], $stops[0]['lon']);
      if (count($stops) > 1) {
        $end = " to " . nominatum_query($stops[count($stops)-1]['lat'], $stops[count($stops)-1]['lon']);
      }
      $replacement = "<h2>{$start}{$end}</h2><p>" . $replacement;
    }
    
    $post['post_content'] = str_replace($matches[0], $replacement, $post['post_content']);
  }
  
  $change_attachment_storage_location = true;
  

  if ($change_attachment_storage_location) {
    add_filter('upload_dir', 'log_upload_dir');
  }

  return($post);
}

function postie_log_attachment_processor_reset() {
  remove_filter('upload_dir', 'log_upload_dir');
}

add_filter('postie_post_before', 'postie_log_attachment_processor_function', 10, 2);
add_filter('postie_post_after', 'postie_log_attachment_processor_reset');

?>
