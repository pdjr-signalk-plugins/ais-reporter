<?php 

namespace PDJR\AisLogPostiePostBefore;

/**********************************************************************
 * Implements a Postie 'post_before' filter which processes incoming
 * emails from 'aislog-uploader'.
 *
 * The filter iterates over post attachments creating new post content
 * which includes either a shortcode or a hyperlink for each extension.
 * Attachments with a name of the form 'filename.ext' result in a
 * shotcode of the form '[ext url=pathname_to_attachment]'. If an
 * attached filename has no extension then a simple hyperlink to the
 * attachment is inserted instead of a shotcode.
 */

function post_before($post) {
  $matches = array();

  $newContent = "";
  $attachments = get_attached_media('', $post['ID']);
  if (!empty($attachments)) {
    foreach ($attachments as $attachmentId => $attachment) {
      $attachmentPathname = get_attached_file($attachmentId);
      $attachmentFilename = basename($attachmentPathname);
      if (preg_match("/(.*)\.(.*)/", $attachmentFilename, $matches)) {
        $newContent .= sprintf("[%s url='%s']<br>\n", $matches[2], $attachmentPathname);
      } else {
        $newContent .= sprintf("<a href='%s'>%s</a>\n", $attachment['guid'], $attachmentFilename);
      }
    }
  }
  $post['post_content'] = "<p>\n{$newContent}</p>\n";

  return($post);
}

add_filter('postie_post_before', 'PDJR\AisLogPostiePostBefore\post_before', 10, 2);

?>
