<?php 

namespace PDJR\PostieAisLogHandler;

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

/**********************************************************************
 * The post's AIS and JSON attachments are rendered here.
 */
function post_before($post) {
  $matches = array();
  $change_attachment_storage_location = false;

  $newContent = "";
  $attachments = get_attached_media('', $post['ID']);
  if (!empty($attachments)) {
    foreach ($attachments as $attachmentId => $attachment) {
      $attachmentPathname = get_attached_file($attachmentId);
      $attachmentFilename = basename($attachmentPathname);
      if (preg_match("/(.*)\.(.*)/", $attachmentFilename, $matches)) {
        $newContent .= sprintf("[%s url='%s']<br>\n", $matches[2], $attachmentPathname);
      }
    }
  }
  $post['post_content'] = "<p>\n{$newContent}</p>\n";


  $change_attachment_storage_location = true;

  if ($change_attachment_storage_location) { add_filter('upload_dir', 'log_upload_dir'); }

  return($post);
}

/**********************************************************************
 * The post's JSON attachment is not required after rendering by the
 * the postie_post_before fiter, so we delete it here.
 */
function post_after($post) {
  global $post_discard_attachments;
  remove_filter('upload_dir', 'log_upload_dir');

}

add_filter('postie_post_before', 'PDJR\PostieAisLogHandler\post_before', 10, 2);
add_filter('postie_post_after', 'PDJR\PostieAisLogHandler\post_after');

?>
