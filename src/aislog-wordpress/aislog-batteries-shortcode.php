<?php

namespace PDJR\AisLogBatteriesShortcode;

/**********************************************************************
 * Add support for [batteries url='...'] shortcode.
 */

function render_attachment($url) {
  $retval=["", []];
  $retval[0] .= "<div id='log-batteries' style='display: flex; flex-direction: column; width: 100%; background: #e0e0e0; margin-top: 20px;'>\n";
  if ($json = json_decode(file_get_contents($url), true)) {
    foreach ($json as $batteryId => $battery) {
      if ((array_key_exists('capacity', $battery)) && (array_key_exists('stateOfCharge', $battery['capacity']))) {
        $retval[0] .= "<div style='display: flex; flex-direction: row; width: 100%;'>";
        $retval[0] .= "<div style='flex: 0.5;'>Battery {$batteryId}</div>";
	$retval[0] .= "<div style='flex: 0.5;'>" . round($battery['capacity']['stateOfCharge']['value'] * 100) . "%</div>\n";
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
    $retval = render_attachment($atts['url'])[0];
  }
  return($retval);
}

add_shortcode('batteries', 'PDJR\AisLogBatteriesShortcode\shortcode');

?>
