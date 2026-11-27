<?php

namespace PDJR\AisLogTanksShortcode;

/**********************************************************************
 * Implements the [tanks url='...'] shortcode.
 * 
 * Processes the file passed via 'url' into an HTML flex table
 * presenting current level data. The supplied file must contain a JSON
 * formatted 'tanks' object returned by a call to the Signal K API.
 */

function render_tanks_attachment($url) {
  $retval="";
  $retval .= "<div id='log-tanks' style='display: flex; flex-direction: column; width: 100%; background: #e0e0e0; margin-top: 20px;'>\n";
  if ($json = json_decode(file_get_contents($url), true)) {
    foreach ($json as $tanktype => $tankids) {
      foreach ($tankids as $tankid => $tank) {
        if (array_key_exists('currentLevel', $tank)) {
          $retval .= "<div style='display: flex; flex-direction: row; width: 100%;'>";
          $retval .= "<div style='flex: 0.5;'>Tank {$tankid} ({$tanktype})</div>";
          $retval .= "<div style='flex: 0.5;'>" . round($tank['currentLevel']['value'] * 100) . "%</div>\n";
          $retval .= "</div>";
        }
      }
    }
  }
  $retval .= "</div>";
  return($retval);
}

function shortcode($atts, $content = null) {
  $retval = "";
  if ($atts['url']) {
    $retval = render_tanks_attachment($atts['url']);
  }
  return($retval);
}

add_shortcode('tanks', 'PDJR\AisLogTanksShortcode\shortcode');

?>
