<?php
# Add support for [tanks url="..."] shortcode.

namespace PDJR\LogTanksShortcode;

function render_tanks_attachment($url) {
  $retval=["", []];
  $retval[0] .= "<div id='log-tanks' style='display: flex; flex-direction: column; width: 100%; background: #e0e0e0; margin-top: 20px;'>\n";
  if ($json = json_decode(file_get_contents($url), true)) {
    foreach ($json as $tanktype => $tankids) {
      foreach ($tankids as $tankid => $tank) {
        if (array_key_exists('currentLevel', $tank)) {
          $retval[0] .= "<div style='display: flex; flex-direction: row; width: 100%;'>";
          $retval[0] .= "<div style='flex: 0.5;'>Tank {$tankid} ({$tanktype})</div>";
          $retval[0] .= "<div style='flex: 0.5;'>" . round($tank['currentLevel']['value'] * 100) . "%</div>\n";
          $retval[0] .= "</div>";
        }
      }
    }
  }
  $retval[0] .= "</div>";
  return($retval);
}

function shortcode($atts, $content = null) {
  $retval = "";
  if ($atts['url']) {
    $retval = render_tanks_attachment($atts['url'])[0];
  }
  return($retval);
}

add_shortcode('tanks', 'PDJR\LogTanksShortcode\shortcode');

?>
