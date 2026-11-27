<?php

namespace PDJR\LogSolarShortcode;

/**********************************************************************
 * Add support for [solar url='...'] shortcode. 
 */

function render_solar_attachment($url) {
  $retval=["", []];
  $retval[0] .= "<div id='log-solar' style='display: flex; flex-direction: column; width: 100%; background: #e0e0e0; margin-top: 20px;'>\n";
  if ($json = json_decode(file_get_contents($url), true)) {
    foreach ($json as $solarId => $solar) {
      if (array_key_exists('yieldYesterday', $solar)) {
        $retval[0] .= "<div style='display: flex; flex-direction: row; width: 100%;'>";
        $retval[0] .= "<div style='flex: 0.5;'>Solar controller {$solarId}</div>";
        $retval[0] .= sprintf("<div style='flex: 0.5;'>%0.2f kWh</div>\n", ($solar['yieldYesterday']['value'] / 3600000));
        $retval[0] .= "</div>";
      }
    }
  }
  $retval[0] .= "</div>";
  return($retval);
}

function shortcode($atts, $content = null) {
  $retval = "";
  if ($atts['url']) {
    $retval = render_solar_attachment($atts['url'])[0];
  }
  return($retval);
}

add_shortcode('solar', 'PDJR\AisLogSolarShortcode\shortcode');

?>