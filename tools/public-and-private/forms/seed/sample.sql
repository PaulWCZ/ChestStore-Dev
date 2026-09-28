-- Sample data for local runs and screenshots (never run by the Chest). The
-- member ids are those of the studio's dev harness (lab/chest-dev).
insert into notes (body, author, pinned, created_at) values
  ('The office is closed on Friday 14 for the bridge day. Enjoy the long weekend!', 'mbr_camilleaaaaaaaaaaaaaaaaaaa', true, now() - interval '2 days'),
  ('Coffee machine fixed. Thanks Hugo!', 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa', false, now() - interval '5 hours'),
  ('New client brochure is on the shared drive, in Sales > 2026.', 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa', false, now() - interval '20 minutes');
