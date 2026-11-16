-- A splash page's uploaded graphic can be an animated GIF or a short .mp4 video as well as a JPEG
-- (src/announcements/media.ts; the app tells them apart by the file's extension). The 'announcements' bucket takes the
-- three, up to 25 MB (SPLASH_MAX_MB in src/announcements/kinds.ts; tests/announcements.test.ts compares).
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/gif', 'video/mp4'], file_size_limit = 26214400
  where id = 'announcements';
